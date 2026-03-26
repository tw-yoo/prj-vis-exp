import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from collections import deque
from string import Template
from typing import Any, Dict, List, Optional, Set, Tuple, Type, Union

import stanza
from pydantic import BaseModel, ConfigDict, Field, create_model

try:
    import instructor
except ImportError:  # pragma: no cover
    instructor = None

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("pipeline_trace")

DEFAULT_DSL_OPERATIONS: Dict[str, str] = {
    "RETRIEVE_VALUE": "Retrieve values for one or more targets",
    "FILTER": "Filter rows by condition or include/exclude targets",
    "ARGMAX": "Find the largest value",
    "ARGMIN": "Find the smallest value",
    "AGG_SUM": "Compute sum",
    "AGG_AVG": "Compute average",
    "MATH_DIFF": "Compute difference or ratio between two targets",
    "DETERMINE_RANGE": "Determine min/max range",
    "COMPARE": "Compare two targets and return winner",
    "COMPARE_BOOL": "Boolean comparison between two targets",
    "SORT": "Sort records",
    "LAG_DIFF": "Difference between consecutive points",
    "NTH": "Select n-th item",
    "COUNT": "Count records",
}

DEPENDENCY_ALLOWLIST = {
    "acl",
    "amod",
    "compound",
    "conj",
    "dep",
    "dobj",
    "nmod",
    "nsubj",
}

MARK_LEXICON: Dict[str, Set[str]] = {
    "bar": {"bar", "bars", "segment", "segments", "component", "components", "portion", "portions"},
    "line": {"line", "lines", "point", "points", "dot", "dots", "trend"},
    "generic": {"mark", "marks", "data", "value", "values"},
}

VISUAL_ATTRIBUTE_LEXICON: Dict[str, Set[str]] = {
    "bar": {
        "height",
        "length",
        "width",
        "color",
        "x",
        "y",
        "left",
        "right",
        "top",
        "bottom",
        "orange",
        "blue",
        "green",
        "red",
    },
    "line": {
        "slope",
        "peak",
        "trough",
        "color",
        "x",
        "y",
        "orange",
        "blue",
        "green",
        "red",
    },
    "generic": {"axis", "legend", "position", "value", "label"},
}

VISUAL_OPERATION_LEXICON: Dict[str, Tuple[str, str]] = {
    "largest": ("ARGMAX", "value"),
    "highest": ("ARGMAX", "value"),
    "top": ("ARGMAX", "value"),
    "maximum": ("ARGMAX", "value"),
    "longest": ("ARGMAX", "length"),
    "tallest": ("ARGMAX", "height"),
    "smallest": ("ARGMIN", "value"),
    "lowest": ("ARGMIN", "value"),
    "minimum": ("ARGMIN", "value"),
    "shortest": ("ARGMIN", "length"),
    "sum": ("AGG_SUM", "value"),
    "total": ("AGG_SUM", "value"),
    "average": ("AGG_AVG", "value"),
    "mean": ("AGG_AVG", "value"),
    "difference": ("MATH_DIFF", "value"),
    "diff": ("MATH_DIFF", "value"),
    "gap": ("MATH_DIFF", "value"),
    "ratio": ("MATH_DIFF", "value"),
    "compare": ("COMPARE", "value"),
    "count": ("COUNT", "value"),
    "sort": ("SORT", "value"),
    "range": ("DETERMINE_RANGE", "value"),
}

AGGREGATE_OPERATION_KEYWORDS: Dict[str, str] = {
    "average": "AGG_AVG",
    "mean": "AGG_AVG",
    "avg": "AGG_AVG",
    "sum": "AGG_SUM",
    "total": "AGG_SUM",
    "count": "COUNT",
    "difference": "MATH_DIFF",
    "diff": "MATH_DIFF",
    "compare": "COMPARE",
    "maximum": "ARGMAX",
    "minimum": "ARGMIN",
}

OPS_SPEC_ALLOWED_OPS: List[str] = [
    "retrieveValue",
    "filter",
    "findExtremum",
    "determineRange",
    "compare",
    "compareBool",
    "sort",
    "sum",
    "average",
    "diff",
    "lagDiff",
    "nth",
    "count",
]

OPS_SPEC_OPERATION_CONTRACT: Dict[str, Dict[str, Any]] = {
    "retrieveValue": {
        "required": ["op", "target"],
        "optional": ["field", "group", "precision", "chartId"],
        "notes": "Use target as label, runtime reference, or {category, series}.",
    },
    "filter": {
        "required": ["op"],
        "optional": ["field", "operator", "value", "include", "exclude", "group", "chartId"],
        "notes": "Use operator+value OR include/exclude.",
    },
    "findExtremum": {
        "required": ["op", "which"],
        "optional": ["field", "group", "chartId"],
        "notes": "which must be max or min.",
    },
    "determineRange": {
        "required": ["op"],
        "optional": ["field", "group", "chartId"],
        "notes": "Range over measure/category domain.",
    },
    "compare": {
        "required": ["op", "targetA", "targetB"],
        "optional": ["field", "groupA", "groupB", "which", "chartId"],
        "notes": "which is optional max|min winner selection.",
    },
    "compareBool": {
        "required": ["op", "targetA", "targetB", "operator"],
        "optional": ["field", "groupA", "groupB", "chartId"],
        "notes": "Boolean comparison between targets.",
    },
    "sort": {
        "required": ["op"],
        "optional": ["field", "order", "group", "chartId"],
        "notes": "order is asc|desc.",
    },
    "sum": {
        "required": ["op", "field"],
        "optional": ["group", "chartId"],
        "notes": "Aggregate sum over filtered context.",
    },
    "average": {
        "required": ["op", "field"],
        "optional": ["group", "chartId"],
        "notes": "Aggregate average over filtered context.",
    },
    "diff": {
        "required": ["op", "targetA", "targetB"],
        "optional": [
            "field",
            "signed",
            "precision",
            "mode",
            "aggregate",
            "percent",
            "scale",
            "targetName",
            "chartId",
        ],
        "notes": "Difference/ratio style numeric comparison.",
    },
    "lagDiff": {
        "required": ["op", "orderField"],
        "optional": ["field", "order", "group", "absolute", "chartId"],
        "notes": "Adjacent delta across ordered sequence.",
    },
    "nth": {
        "required": ["op", "n"],
        "optional": ["from", "orderField", "group", "chartId"],
        "notes": "n is 1-based. from is left|right.",
    },
    "count": {
        "required": ["op"],
        "optional": ["field", "group", "chartId"],
        "notes": "Count records in current context.",
    },
}

PrimitiveFilterValue = Union[str, int, float]


class NLPEngine:
    def __init__(
        self,
        language: str = "en",
        use_gpu: bool = False,
        ollama_model: str = "qwen2.5-coder:1.5b",
        ollama_base_url: str = "http://localhost:11434/v1",
        ollama_api_key: str = "ollama",
    ) -> None:
        self.language = language
        self.use_gpu = use_gpu
        self.ollama_model = ollama_model
        self.ollama_base_url = ollama_base_url
        self.ollama_api_key = ollama_api_key

        self.stanza_pipeline = None
        self.llm_client = None
        self.llm_backend: Optional[str] = None
        self.dsl_operations: Dict[str, str] = {}
        self.llm_response_model: Optional[Type[BaseModel]] = None
        self.lambda_prompt_template: Optional[str] = None
        self.ops_spec_response_model: Optional[Type[BaseModel]] = None
        self.ops_spec_prompt_template: Optional[str] = None

    def load(self) -> None:
        if (
            self.stanza_pipeline is not None
            and self.llm_backend is not None
            and self.llm_response_model is not None
            and self.lambda_prompt_template is not None
            and self.ops_spec_response_model is not None
            and self.ops_spec_prompt_template is not None
        ):
            return

        try:
            self.dsl_operations = dict(DEFAULT_DSL_OPERATIONS)
            self.llm_response_model = self._build_llm_response_model(list(self.dsl_operations.keys()))
            self.lambda_prompt_template = self._load_lambda_prompt_template()
            self.ops_spec_response_model = self._build_ops_spec_response_model(OPS_SPEC_ALLOWED_OPS)
            self.ops_spec_prompt_template = self._load_ops_spec_prompt_template()

            stanza.download(self.language, processors="tokenize,pos,lemma,depparse", verbose=False)
            self.stanza_pipeline = stanza.Pipeline(
                lang=self.language,
                processors="tokenize,pos,lemma,depparse",
                use_gpu=self.use_gpu,
                verbose=False,
            )

            if instructor is not None and OpenAI is not None:
                base_client = OpenAI(base_url=self.ollama_base_url, api_key=self.ollama_api_key)
                mode = self._resolve_instructor_mode()
                self.llm_client = instructor.from_openai(base_client, mode=mode)
                self.llm_backend = "instructor_openai"
            else:
                self.llm_client = None
                self.llm_backend = "ollama_native"
                logger.warning(
                    "instructor/openai not installed; using Ollama native structured output path."
                )
        except Exception as exc:
            raise RuntimeError(f"Failed to load NLP engine resources: {exc}") from exc

    def generate_lambda(
        self,
        text: str,
        chart_context: Dict[str, Any],
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self._validate_loaded()

        normalized_text = " ".join(text.split())
        if not normalized_text:
            return {
                "resolved_text": "",
                "lambda_expression": [],
                "ops_spec": {},
                "syntax_features": [],
                "mark_terms": [],
                "visual_terms": [],
                "rewrite_trace": [],
                "warnings": [],
            }

        trace_id = request_id or "unknown"
        started_at = time.perf_counter()
        warnings: List[str] = []
        normalized_chart_context = self._normalize_chart_context(chart_context)
        self._log_pipeline_stage(trace_id, "natural_language", {"text": normalized_text})
        syntax_features = self.extract_syntax_features(normalized_text)
        self._log_pipeline_stage(trace_id, "dependency_tree", {"syntax_features": syntax_features})
        self._log_pipeline_stage(trace_id, "chart_context", {"chart_context": normalized_chart_context})
        grounding = self._ground_syntax_features(
            resolved_text=normalized_text,
            syntax_features=syntax_features,
            chart_context=normalized_chart_context,
        )
        self._log_pipeline_stage(trace_id, "grounding", {"grounding": grounding})
        branch_plan = self._infer_branch_plan_non_visual(
            resolved_text=normalized_text,
            syntax_features=syntax_features,
            chart_context=normalized_chart_context,
            grounding=grounding,
        )
        self._log_pipeline_stage(trace_id, "branch_plan", {"branch_plan": branch_plan})
        for msg in branch_plan.get("warnings", []) if isinstance(branch_plan, dict) else []:
            warnings.append(f"branch_plan: {msg}")
        mark_terms = self._detect_mark_terms(normalized_text)
        descriptive_terms = self._collect_descriptive_terms(syntax_features)
        visual_attribute_terms = self._detect_visual_attribute_terms(descriptive_terms)
        visual_operation_terms = self._detect_visual_operation_terms(descriptive_terms)
        visual_terms = sorted(set(visual_attribute_terms + visual_operation_terms))
        rewrite_trace = self._build_rewrite_trace(normalized_text, mark_terms, visual_attribute_terms, visual_operation_terms)
        lambda_hints = self._build_lambda_hints(
            resolved_text=normalized_text,
            syntax_features=syntax_features,
            chart_context=normalized_chart_context,
        )
        # Grounding is a debugging/constraint signal for the LLM prompt (kept compact).
        lambda_hints["grounding"] = grounding
        lambda_hints["branch_plan"] = branch_plan
        self._log_pipeline_stage(trace_id, "lambda_hints", {"lambda_hints": lambda_hints})

        llm_steps = self._parse_with_constraints(
            resolved_text=normalized_text,
            syntax_features=syntax_features,
            chart_context=normalized_chart_context,
            lambda_hints=lambda_hints,
            mark_terms=mark_terms,
            visual_terms=visual_terms,
            rewrite_trace=rewrite_trace,
        )

        normalized_steps: List[Dict[str, Any]] = []
        for index, step in enumerate(llm_steps, start=1):
            payload = {k: v for k, v in step.items() if v is not None}
            payload["step"] = index
            normalized_steps.append(payload)
        self._log_pipeline_stage(trace_id, "lambda_expression", {"lambda_expression": normalized_steps})
        logger.info(
            "[nlp_engine] lambda generated | steps=%d marks=%d visual_terms=%d",
            len(normalized_steps),
            len(mark_terms),
            len(visual_terms),
        )

        try:
            ops_spec = self._generate_ops_spec_with_constraints(
                resolved_text=normalized_text,
                lambda_expression=normalized_steps,
                syntax_features=syntax_features,
                chart_context=normalized_chart_context,
                mark_terms=mark_terms,
                visual_terms=visual_terms,
                rewrite_trace=rewrite_trace,
            )
            ops_spec = self._postprocess_ops_spec_groups(
                ops_spec=ops_spec,
                chart_context=normalized_chart_context,
                branch_plan=branch_plan,
            )
        except Exception as exc:
            ops_spec = {}
            warnings.append(f"opsSpec generation failed: {exc}")

        self._log_pipeline_stage(
            trace_id,
            "ops_spec",
            {
                "ops_spec": ops_spec,
                "warnings": warnings,
            },
        )

        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[nlp_engine] parse pipeline completed | ops_groups=%d warnings=%d elapsed_ms=%.1f",
            len(ops_spec),
            len(warnings),
            elapsed_ms,
        )

        return {
            "resolved_text": normalized_text,
            "lambda_expression": normalized_steps,
            "ops_spec": ops_spec,
            "syntax_features": syntax_features,
            "mark_terms": mark_terms,
            "visual_terms": visual_terms,
            "rewrite_trace": rewrite_trace,
            "warnings": warnings,
        }

    def _postprocess_ops_spec_groups(
        self,
        ops_spec: Dict[str, List[Dict[str, Any]]],
        chart_context: Dict[str, Any],
        branch_plan: Dict[str, Any],
    ) -> Dict[str, List[Dict[str, Any]]]:
        if not isinstance(ops_spec, dict) or not isinstance(branch_plan, dict):
            return ops_spec

        measure_field = str(branch_plan.get("measure_field") or chart_context.get("primary_measure") or "").strip()
        selector_kind = str(branch_plan.get("selector_kind") or "").strip().lower()
        selector_values = branch_plan.get("selector_values")
        selector_values = [str(v).strip() for v in selector_values] if isinstance(selector_values, list) else []

        # Fast path: if LLM returned a single generic chain for multi-selectors, rebuild deterministically.
        if selector_values and len(selector_values) >= 2:
            expected_groups = ["ops"] + [f"ops{i+1}" for i in range(1, len(selector_values))]
            has_any_expected = any(name in ops_spec for name in expected_groups)
            if not has_any_expected and "ops" in ops_spec:
                rebuilt = self._build_ops_spec_from_branch_plan(branch_plan, chart_context)
                return rebuilt

        by_branch_value: Dict[str, str] = {}
        for branch in branch_plan.get("branches", []) if isinstance(branch_plan.get("branches"), list) else []:
            if not isinstance(branch, dict):
                continue
            name = str(branch.get("name") or "").strip()
            group_value = str(branch.get("group") or "").strip()
            include_targets = branch.get("include_targets")
            include_value = str(include_targets[0]).strip() if isinstance(include_targets, list) and include_targets else ""
            if selector_kind == "series" and name and group_value:
                by_branch_value[name] = group_value
            if selector_kind == "target" and name and include_value:
                by_branch_value[name] = include_value

        def fix_filter_field(op: Dict[str, Any]) -> None:
            if op.get("op") != "filter":
                return
            has_membership = isinstance(op.get("include"), list) and len(op.get("include")) > 0 or isinstance(op.get("exclude"), list) and len(op.get("exclude")) > 0
            has_operator = bool(op.get("operator"))
            if has_membership and not has_operator:
                # Membership filter is always applied on x-axis target labels in our engine.
                op["field"] = "target"

        def fix_aggregate_field(op: Dict[str, Any]) -> None:
            if op.get("op") not in {"average", "sum"}:
                return
            field = str(op.get("field") or "").strip()
            if not measure_field:
                return
            # Replace generic / missing field with actual measure field.
            if not field or field.lower() == "value":
                op["field"] = measure_field

        def rewrite_series_branch_ops(group_name: str, ops: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            selector = by_branch_value.get(group_name, "")
            if not selector:
                return ops
            out_ops: List[Dict[str, Any]] = []
            for op in ops:
                if not isinstance(op, dict):
                    continue
                if op.get("op") == "filter":
                    include = op.get("include")
                    exclude = op.get("exclude")
                    # If filter is just selecting series values, drop it (series selection must be op.group).
                    if (
                        isinstance(include, list)
                        and len(include) == 1
                        and str(include[0]).strip() == selector
                        and not op.get("operator")
                        and op.get("value") is None
                    ):
                        continue
                    if (
                        isinstance(exclude, list)
                        and len(exclude) == 1
                        and str(exclude[0]).strip() == selector
                        and not op.get("operator")
                        and op.get("value") is None
                    ):
                        continue
                if op.get("op") in {"average", "sum", "count"}:
                    if not op.get("group"):
                        op["group"] = selector
                out_ops.append(op)
            return out_ops

        def ensure_target_filter(group_name: str, ops: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            selector = by_branch_value.get(group_name, "")
            if not selector:
                return ops
            # If there's already a membership filter including selector, just normalize its field.
            for op in ops:
                if not isinstance(op, dict) or op.get("op") != "filter":
                    continue
                include = op.get("include")
                if isinstance(include, list) and any(str(v).strip() == selector for v in include) and not op.get("operator"):
                    op["field"] = "target"
                    return ops
            # Otherwise insert at the beginning.
            return [{"op": "filter", "field": "target", "include": [selector]}] + ops

        out: Dict[str, List[Dict[str, Any]]] = {}
        for group_name, ops in ops_spec.items():
            if not isinstance(ops, list):
                continue
            cleaned: List[Dict[str, Any]] = []
            for op in ops:
                if not isinstance(op, dict):
                    continue
                fix_filter_field(op)
                fix_aggregate_field(op)
                cleaned.append(op)

            if selector_kind == "series":
                cleaned = rewrite_series_branch_ops(group_name, cleaned)
            elif selector_kind == "target":
                cleaned = ensure_target_filter(group_name, cleaned)

            out[group_name] = cleaned

        return out if out else ops_spec

    def _build_ops_spec_from_branch_plan(
        self,
        branch_plan: Dict[str, Any],
        chart_context: Dict[str, Any],
    ) -> Dict[str, List[Dict[str, Any]]]:
        measure_field = str(branch_plan.get("measure_field") or chart_context.get("primary_measure") or "").strip()
        selector_kind = str(branch_plan.get("selector_kind") or "").strip().lower()
        selector_values = branch_plan.get("selector_values")
        selector_values = [str(v).strip() for v in selector_values] if isinstance(selector_values, list) else []
        aggregate_op = str(branch_plan.get("aggregate_op") or "").strip().upper()

        if aggregate_op == "AGG_SUM":
            agg_name = "sum"
        elif aggregate_op == "COUNT":
            agg_name = "count"
        else:
            agg_name = "average"

        out: Dict[str, List[Dict[str, Any]]] = {"ops": []}
        if not selector_values:
            if agg_name in {"average", "sum"}:
                out["ops"] = [{"op": agg_name, "field": measure_field or "value"}]
            else:
                out["ops"] = [{"op": "count"}]
            return out

        for index, selector in enumerate(selector_values):
            name = "ops" if index == 0 else f"ops{index+1}"
            if selector_kind == "series":
                if agg_name in {"average", "sum"}:
                    out[name] = [{"op": agg_name, "field": measure_field or "value", "group": selector}]
                else:
                    out[name] = [{"op": "count", "group": selector}]
            else:
                prefix = [{"op": "filter", "field": "target", "include": [selector]}]
                if agg_name in {"average", "sum"}:
                    out[name] = prefix + [{"op": agg_name, "field": measure_field or "value"}]
                else:
                    out[name] = prefix + [{"op": "count"}]
        return out

    def _log_pipeline_stage(self, request_id: str, stage: str, payload: Dict[str, Any]) -> None:
        try:
            serialized = json.dumps(payload, ensure_ascii=False)
        except Exception:
            serialized = str(payload)
        trace_logger.info("[request:%s] %s | %s", request_id, stage, serialized)

    def extract_syntax_features(self, text: str) -> List[Dict[str, Any]]:
        self._validate_loaded(require_llm=False)
        doc = self.stanza_pipeline(text)
        features: List[Dict[str, Any]] = []

        for sentence_index, sentence in enumerate(doc.sentences, start=1):
            words = sentence.words
            root = next((word for word in words if word.deprel == "root"), None)
            children = self._build_children_map(words)
            root_action = root.lemma if root and root.lemma else (root.text if root else "")
            target = self._extract_first_by_relation(words, children, relations=["obj", "dobj", "nsubj", "nsubj:pass"])
            condition = self._extract_first_by_relation(words, children, relations=["obl", "nmod"])

            sentence_mark_terms = self._detect_mark_terms(sentence.text)
            descriptive_terms = self._collect_sentence_descriptive_terms(words, sentence_mark_terms)
            visual_attribute_terms = self._detect_visual_attribute_terms(descriptive_terms)
            visual_operation_terms = self._detect_visual_operation_terms(descriptive_terms)

            tokens = [
                {
                    "id": word.id,
                    "text": word.text,
                    "lemma": word.lemma,
                    "upos": word.upos,
                    "head": word.head,
                    "deprel": word.deprel,
                }
                for word in words
            ]

            features.append(
                {
                    "sentence_index": sentence_index,
                    "text": sentence.text,
                    "root_action": root_action,
                    "target_hint": target,
                    "condition_hint": condition,
                    "mark_terms": sorted(sentence_mark_terms),
                    "descriptive_terms": sorted(descriptive_terms),
                    "visual_attribute_terms": sorted(visual_attribute_terms),
                    "visual_operation_terms": sorted(visual_operation_terms),
                    "tokens": tokens,
                }
            )

        return features

    def _parse_with_constraints(
        self,
        resolved_text: str,
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
        lambda_hints: Dict[str, Any],
        mark_terms: List[str],
        visual_terms: List[str],
        rewrite_trace: List[Dict[str, str]],
    ) -> List[Dict[str, Any]]:
        self._validate_loaded()
        response_model = self.llm_response_model
        if response_model is None:
            raise RuntimeError("Constrained response model is not initialized.")

        operation_keys = list(self.dsl_operations.keys())
        operation_list_text = ", ".join(operation_keys)

        system_prompt = (
            "You are a deterministic semantic parser for chart reasoning traces. "
            "Generate only a JSON object that matches the provided schema. "
            "Do not add prose, markdown, explanations, or code fences. "
            f"Only use operations in this set: {operation_list_text}."
        )

        user_prompt = self._render_lambda_prompt(
            resolved_text=resolved_text,
            syntax_features=syntax_features,
            chart_context=chart_context,
            lambda_hints=lambda_hints,
            mark_terms=mark_terms,
            visual_terms=visual_terms,
            rewrite_trace=rewrite_trace,
        )

        payload = self._run_structured_completion(
            response_model=response_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            task_name="lambda_expression",
        )

        steps = payload.get("lambda_expression", [])
        logger.info("[nlp_engine] llm lambda completion received | backend=%s steps=%d", self.llm_backend, len(steps))
        self._validate_step_operations(steps)
        return steps

    def _generate_ops_spec_with_constraints(
        self,
        resolved_text: str,
        lambda_expression: List[Dict[str, Any]],
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
        mark_terms: List[str],
        visual_terms: List[str],
        rewrite_trace: List[Dict[str, str]],
    ) -> Dict[str, List[Dict[str, Any]]]:
        self._validate_loaded()
        response_model = self.ops_spec_response_model
        if response_model is None:
            raise RuntimeError("opsSpec response model is not initialized.")

        system_prompt = (
            "You are a deterministic compiler from lambda expression steps to OperationSpec JSON groups. "
            "Return only JSON that matches the schema. "
            "No prose, no markdown."
        )
        user_prompt = self._render_ops_spec_prompt(
            resolved_text=resolved_text,
            lambda_expression=lambda_expression,
            syntax_features=syntax_features,
            chart_context=chart_context,
            mark_terms=mark_terms,
            visual_terms=visual_terms,
            rewrite_trace=rewrite_trace,
        )

        payload = self._run_structured_completion(
            response_model=response_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            task_name="ops_spec",
        )

        groups = payload.get("groups", [])
        normalized_groups = self._normalize_ops_spec_groups(groups)
        logger.info(
            "[nlp_engine] llm opsSpec completion received | backend=%s groups=%d",
            self.llm_backend,
            len(normalized_groups),
        )
        return normalized_groups

    def _render_ops_spec_prompt(
        self,
        resolved_text: str,
        lambda_expression: List[Dict[str, Any]],
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
        mark_terms: List[str],
        visual_terms: List[str],
        rewrite_trace: List[Dict[str, str]],
    ) -> str:
        template_text = self.ops_spec_prompt_template
        if not template_text:
            raise RuntimeError("opsSpec prompt template is not loaded.")

        template = Template(template_text)
        return template.safe_substitute(
            resolved_text=resolved_text,
            lambda_json=json.dumps(lambda_expression, ensure_ascii=True, indent=2),
            syntax_json=json.dumps(syntax_features, ensure_ascii=True, indent=2),
            chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
            mark_terms_json=json.dumps(mark_terms, ensure_ascii=True),
            visual_terms_json=json.dumps(visual_terms, ensure_ascii=True),
            rewrite_trace_json=json.dumps(rewrite_trace, ensure_ascii=True, indent=2),
            ops_names_json=json.dumps(OPS_SPEC_ALLOWED_OPS, ensure_ascii=True),
            ops_contract_json=json.dumps(OPS_SPEC_OPERATION_CONTRACT, ensure_ascii=True, indent=2),
        )

    def _normalize_ops_spec_groups(self, groups: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        out: Dict[str, List[Dict[str, Any]]] = {}
        if not isinstance(groups, list):
            return {"ops": []}

        for group in groups:
            if not isinstance(group, dict):
                continue
            raw_name = str(group.get("name", "")).strip()
            if not raw_name:
                continue
            name = re.sub(r"[^A-Za-z0-9_]", "", raw_name)
            if not name:
                continue

            ops_raw = group.get("ops", [])
            if not isinstance(ops_raw, list):
                continue

            normalized_ops: List[Dict[str, Any]] = []
            for op in ops_raw:
                if not isinstance(op, dict):
                    continue
                op_name = str(op.get("op", "")).strip()
                if op_name not in OPS_SPEC_ALLOWED_OPS:
                    continue
                cleaned = {k: v for k, v in op.items() if v is not None}
                normalized_include = self._normalize_filter_members(cleaned.get("include"))
                if normalized_include is None:
                    cleaned.pop("include", None)
                else:
                    cleaned["include"] = normalized_include

                normalized_exclude = self._normalize_filter_members(cleaned.get("exclude"))
                if normalized_exclude is None:
                    cleaned.pop("exclude", None)
                else:
                    cleaned["exclude"] = normalized_exclude
                normalized_ops.append(cleaned)
            out[name] = normalized_ops

        if "ops" not in out:
            out["ops"] = []

        ordered_keys: List[str] = []
        if "ops" in out:
            ordered_keys.append("ops")
        for key in sorted(k for k in out.keys() if re.match(r"^ops\\d+$", k)):
            if key not in ordered_keys:
                ordered_keys.append(key)
        for key in sorted(k for k in out.keys() if k not in {"ops", "last"} and not re.match(r"^ops\\d+$", k)):
            if key not in ordered_keys:
                ordered_keys.append(key)
        if "last" in out:
            ordered_keys.append("last")
        for key in out.keys():
            if key not in ordered_keys:
                ordered_keys.append(key)

        return {key: out[key] for key in ordered_keys}

    def _normalize_filter_members(self, values: Any) -> Optional[List[PrimitiveFilterValue]]:
        if values is None:
            return None
        if not isinstance(values, list):
            return None

        out: List[PrimitiveFilterValue] = []
        for value in values:
            normalized = self._normalize_filter_member(value)
            if normalized is None:
                continue
            out.append(normalized)
        return out or None

    def _normalize_filter_member(self, value: Any) -> Optional[PrimitiveFilterValue]:
        if isinstance(value, bool):
            return None
        if isinstance(value, (str, int, float)):
            if isinstance(value, str):
                stripped = value.strip()
                return stripped if stripped else None
            return value
        if isinstance(value, dict) and "value" in value:
            # Recover from malformed LLM outputs like {"value": "Broadcasting"}.
            return self._normalize_filter_member(value.get("value"))
        return None

    def _run_structured_completion(
        self,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        if self.llm_backend == "instructor_openai":
            try:
                parsed = self.llm_client.chat.completions.create(
                    model=self.ollama_model,
                    response_model=response_model,
                    temperature=0,
                    top_p=1,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    extra_body={
                        "format": response_model.model_json_schema(),
                        "options": {"temperature": 0, "top_p": 1},
                    },
                )
            except Exception as exc:
                raise RuntimeError(f"Constrained {task_name} parsing with Ollama failed: {exc}") from exc

            try:
                if isinstance(parsed, dict):
                    parsed_dict = parsed
                elif isinstance(parsed, BaseModel):
                    parsed_dict = parsed.model_dump()
                else:
                    parsed_dict = parsed.model_dump()
                validated = response_model.model_validate(parsed_dict)
                return validated.model_dump(by_alias=True)
            except Exception as exc:
                raise RuntimeError(f"{task_name} output validation failed: {exc}") from exc
        if self.llm_backend == "ollama_native":
            return self._parse_with_ollama_native(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
        raise RuntimeError("LLM backend is not initialized.")

    def _parse_with_ollama_native(
        self,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        base_url = self._to_ollama_native_base_url(self.ollama_base_url)
        endpoint = f"{base_url}/api/chat"
        request_payload = {
            "model": self.ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "format": response_model.model_json_schema(),
            "options": {"temperature": 0, "top_p": 1},
        }

        request_data = json.dumps(request_payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=request_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Ollama HTTP error ({exc.code}): {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to call Ollama native API: {exc}") from exc

        try:
            outer = json.loads(raw)
            content = outer["message"]["content"]
            inner = json.loads(content)
            validated = response_model.model_validate(inner)
            return validated.model_dump(by_alias=True)
        except Exception as exc:
            raise RuntimeError(f"Failed to parse Ollama structured output: {exc}") from exc

    def _to_ollama_native_base_url(self, base_url: str) -> str:
        normalized = base_url.rstrip("/")
        if normalized.endswith("/v1"):
            return normalized[:-3]
        return normalized

    def _normalize_text_list(self, values: Any) -> List[str]:
        if not isinstance(values, list):
            return []
        out: List[str] = []
        for value in values:
            text = str(value).strip()
            if not text or text in out:
                continue
            out.append(text)
        return out

    def _normalize_chart_context(self, chart_context: Dict[str, Any]) -> Dict[str, Any]:
        fields = self._normalize_text_list(chart_context.get("fields"))
        if not fields:
            raise RuntimeError("chart_context.fields must contain at least one field.")

        dimension_fields = self._normalize_text_list(chart_context.get("dimension_fields"))
        measure_fields = self._normalize_text_list(chart_context.get("measure_fields"))
        primary_dimension = str(chart_context.get("primary_dimension", "")).strip()
        primary_measure = str(chart_context.get("primary_measure", "")).strip()
        series_field_raw = chart_context.get("series_field")
        series_field = str(series_field_raw).strip() if series_field_raw is not None else None
        series_field = series_field or None

        if not primary_dimension:
            primary_dimension = (dimension_fields[0] if dimension_fields else fields[0])
        if not primary_measure:
            if measure_fields:
                primary_measure = measure_fields[0]
            else:
                non_dim = [field for field in fields if field != primary_dimension]
                primary_measure = non_dim[0] if non_dim else fields[0]

        categorical_values: Dict[str, List[str]] = {}
        raw_values = chart_context.get("categorical_values")
        if isinstance(raw_values, dict):
            for field, values in raw_values.items():
                field_name = str(field).strip()
                if not field_name:
                    continue
                normalized_values = self._normalize_text_list(values)
                if normalized_values:
                    categorical_values[field_name] = normalized_values

        return {
            "fields": fields,
            "dimension_fields": dimension_fields,
            "measure_fields": measure_fields,
            "primary_dimension": primary_dimension,
            "primary_measure": primary_measure,
            "series_field": series_field,
            "categorical_values": categorical_values,
        }

    def _build_lambda_hints(
        self,
        resolved_text: str,
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        aggregate_operations = self._extract_aggregate_operations(resolved_text, syntax_features)
        measure_candidates = self._extract_measure_candidates(resolved_text, syntax_features, chart_context)
        selector_values = self._extract_selector_values(syntax_features)
        selector_clauses: List[Dict[str, str]] = []
        for value in selector_values:
            selector_field = self._match_selector_field(value, chart_context)
            payload = {"value": value}
            if selector_field:
                payload["field"] = selector_field
            selector_clauses.append(payload)

        context_value_matches = self._extract_context_value_matches(resolved_text, chart_context)

        return {
            "aggregate_operations": aggregate_operations,
            "measure_candidates": measure_candidates,
            "selector_clauses": selector_clauses,
            "scope_clauses": self._extract_scope_clauses(resolved_text),
            "numeric_parenthetical": re.findall(r"\((?:\s*[≈~]?\s*)([-+]?\d+(?:\.\d+)?)\s*\)", resolved_text),
            "context_value_matches": context_value_matches,
        }

    def _extract_aggregate_operations(self, resolved_text: str, syntax_features: List[Dict[str, Any]]) -> List[str]:
        lower_text = resolved_text.lower()
        discovered: List[str] = []

        def push(op: str) -> None:
            if op not in discovered:
                discovered.append(op)

        for keyword, operation in AGGREGATE_OPERATION_KEYWORDS.items():
            if re.search(rf"\b{re.escape(keyword)}\b", lower_text):
                push(operation)

        for feature in syntax_features:
            for token in feature.get("tokens", []) or []:
                lemma = str(token.get("lemma") or token.get("text") or "").strip().lower()
                if not lemma:
                    continue
                operation = AGGREGATE_OPERATION_KEYWORDS.get(lemma)
                if operation:
                    push(operation)

        return discovered

    def _extract_measure_candidates(
        self,
        resolved_text: str,
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
    ) -> List[str]:
        lower_text = resolved_text.lower()
        candidates: List[str] = []
        measure_fields = chart_context.get("measure_fields", []) or []
        all_fields = chart_context.get("fields", []) or []
        primary_measure = chart_context.get("primary_measure")

        def push(field_name: str) -> None:
            if field_name and field_name not in candidates:
                candidates.append(field_name)

        for field_name in measure_fields:
            if re.search(rf"(?<!\w){re.escape(field_name.lower())}(?!\w)", lower_text):
                push(field_name)

        searchable_fragments = [resolved_text]
        for feature in syntax_features:
            for key in ("target_hint", "condition_hint"):
                value = str(feature.get(key) or "").strip()
                if value:
                    searchable_fragments.append(value)

        if not candidates:
            for fragment in searchable_fragments:
                lower_fragment = fragment.lower()
                for field_name in all_fields:
                    if re.search(rf"(?<!\w){re.escape(field_name.lower())}(?!\w)", lower_fragment):
                        push(field_name)

        if not candidates and isinstance(primary_measure, str) and primary_measure:
            push(primary_measure)

        return candidates

    def _extract_selector_values(self, syntax_features: List[Dict[str, Any]]) -> List[str]:
        selectors: List[str] = []

        def push(value: str) -> None:
            text = str(value).strip()
            if not text or text in selectors:
                return
            selectors.append(text)

        for feature in syntax_features:
            tokens = feature.get("tokens", []) or []
            token_by_id: Dict[int, Dict[str, Any]] = {}
            for token in tokens:
                token_id = token.get("id")
                if isinstance(token_id, int):
                    token_by_id[token_id] = token

            conj_adj: Dict[int, Set[int]] = {}
            for token in tokens:
                token_id = token.get("id")
                head_id = token.get("head")
                if not isinstance(token_id, int) or not isinstance(head_id, int):
                    continue
                if str(token.get("deprel") or "").strip().lower() != "conj":
                    continue
                conj_adj.setdefault(token_id, set()).add(head_id)
                conj_adj.setdefault(head_id, set()).add(token_id)

            def normalize_selector_surface(token_payload: Dict[str, Any]) -> str:
                raw = str(token_payload.get("lemma") or token_payload.get("text") or "").strip()
                # Strip quotes/footnote artifacts and keep a stable selector token.
                cleaned = re.sub(r"[^A-Za-z0-9_\\-]+", "", raw)
                return cleaned or raw

            def collect_conj_group(start_id: int) -> List[int]:
                visited: Set[int] = set()
                queue: deque[int] = deque([start_id])
                while queue:
                    current = queue.popleft()
                    if current in visited:
                        continue
                    visited.add(current)
                    for nxt in conj_adj.get(current, set()):
                        if nxt not in visited:
                            queue.append(nxt)
                return sorted(visited)

            for token in tokens:
                token_text = str(token.get("text") or "").strip().lower()
                token_deprel = str(token.get("deprel") or "").strip().lower()
                if token_text != "for" or token_deprel != "case":
                    continue
                head_id = token.get("head")
                if not isinstance(head_id, int):
                    continue
                head = token_by_id.get(head_id)
                if not head:
                    continue

                group_ids = collect_conj_group(head_id)
                for token_id in group_ids:
                    item = token_by_id.get(token_id)
                    if not item:
                        continue
                    surface = normalize_selector_surface(item)
                    if surface:
                        push(surface)

            sentence_text = str(feature.get("text") or "")
            for match in re.findall(
                r"\bfor\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*(?:,|and)\s*[A-Za-z_][A-Za-z0-9_]*)*)",
                sentence_text,
                flags=re.IGNORECASE,
            ):
                parts = re.split(r"\s*(?:,|and)\s*", match, flags=re.IGNORECASE)
                for part in parts:
                    push(part)

        return selectors

    def _match_selector_field(self, selector_value: str, chart_context: Dict[str, Any]) -> Optional[str]:
        selector_lower = selector_value.lower()
        categorical_values = chart_context.get("categorical_values", {}) or {}
        series_field = chart_context.get("series_field")

        if isinstance(series_field, str) and series_field:
            for candidate in categorical_values.get(series_field, []):
                if str(candidate).lower() == selector_lower:
                    return series_field

        for field_name, values in categorical_values.items():
            for candidate in values:
                if str(candidate).lower() == selector_lower:
                    return field_name

        primary_dimension = chart_context.get("primary_dimension")
        if isinstance(primary_dimension, str) and primary_dimension:
            return primary_dimension
        return None

    def _extract_scope_clauses(self, text: str) -> List[str]:
        scopes: List[str] = []
        for pattern in (r"\bacross\s+[^,.;()]+", r"\bover\s+[^,.;()]+"):
            for match in re.findall(pattern, text, flags=re.IGNORECASE):
                clause = match.strip()
                if clause and clause not in scopes:
                    scopes.append(clause)
        return scopes

    def _extract_context_value_matches(self, text: str, chart_context: Dict[str, Any]) -> Dict[str, List[str]]:
        lower_text = text.lower()
        matches: Dict[str, List[str]] = {}
        categorical_values = chart_context.get("categorical_values", {}) or {}
        for field_name, values in categorical_values.items():
            hit_values: List[str] = []
            for value in values:
                value_text = str(value).strip()
                if not value_text:
                    continue
                if re.search(rf"(?<!\w){re.escape(value_text.lower())}(?!\w)", lower_text):
                    hit_values.append(value_text)
            if hit_values:
                matches[field_name] = hit_values
        return matches

    def _infer_branch_plan_non_visual(
        self,
        resolved_text: str,
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
        grounding: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Determine a non-visual branch plan:
        - measure field (y / primary_measure)
        - selector values (for X and Y ...)
        - whether selectors are series values or x-axis target values
        - branch layout (ops, ops2, ...)

        This does not execute anything. It is used as a constraint signal for LLM prompts and trace logs.
        """
        warnings: List[str] = []

        def norm(text: str) -> str:
            return re.sub(r"[^A-Za-z0-9_\\-]+", "", str(text or "")).strip().lower()

        series_field = str(chart_context.get("series_field") or "").strip() or None
        primary_dimension = str(chart_context.get("primary_dimension") or "").strip() or None
        primary_measure = str(chart_context.get("primary_measure") or "").strip() or None
        categorical_values = chart_context.get("categorical_values", {}) or {}

        # Aggregate op (prefer explicit grounding).
        aggregate_op: Optional[str] = None
        ops_grounded = grounding.get("operators", []) if isinstance(grounding, dict) else []
        if isinstance(ops_grounded, list) and ops_grounded:
            op = ops_grounded[0].get("operation") if isinstance(ops_grounded[0], dict) else None
            aggregate_op = str(op).strip() if op else None
        if not aggregate_op:
            discovered = self._extract_aggregate_operations(resolved_text, syntax_features)
            aggregate_op = discovered[0] if discovered else None

        # Measure field (prefer y-axis field grounding).
        measure_field: Optional[str] = None
        grounded_fields = grounding.get("fields", []) if isinstance(grounding, dict) else []
        if isinstance(grounded_fields, list):
            for item in grounded_fields:
                if not isinstance(item, dict):
                    continue
                if item.get("component") == "y_axis_field":
                    candidate = str(item.get("field") or "").strip()
                    if candidate:
                        measure_field = candidate
                        break
        if not measure_field:
            measure_field = primary_measure

        selector_values = self._extract_selector_values(syntax_features)
        if not selector_values:
            warnings.append("No selector values detected (no 'for X' pattern).")

        # Determine selector kind: series vs target.
        selector_kind = "unknown"
        selector_field: Optional[str] = None

        series_domain = categorical_values.get(series_field, []) if series_field else []
        dim_domain = categorical_values.get(primary_dimension, []) if primary_dimension else []
        series_norm = {norm(v): str(v) for v in series_domain}
        dim_norm = {norm(v): str(v) for v in dim_domain}

        has_series_match = any(norm(v) in series_norm for v in selector_values)
        has_dim_match = any(norm(v) in dim_norm for v in selector_values)

        if has_series_match:
            selector_kind = "series"
            selector_field = series_field
        elif has_dim_match:
            selector_kind = "target"
            selector_field = primary_dimension
        else:
            if series_field:
                selector_kind = "series"
                selector_field = series_field
                if selector_values:
                    warnings.append(
                        "categorical_values did not contain selectors; assuming selectors are series values "
                        f"for series_field='{series_field}'."
                    )
            else:
                selector_kind = "target"
                selector_field = primary_dimension
                if selector_values:
                    warnings.append(
                        "categorical_values did not contain selectors and no series_field; assuming selectors are x-axis targets."
                    )

        branches: List[Dict[str, Any]] = []
        for index, raw_value in enumerate(selector_values):
            value = str(raw_value).strip()
            if not value:
                continue
            name = "ops" if index == 0 else f"ops{index+1}"
            branch: Dict[str, Any] = {"name": name}
            if selector_kind == "series":
                branch["group"] = value
                branch["include_targets"] = None
            elif selector_kind == "target":
                branch["group"] = None
                branch["include_targets"] = [value]
            else:
                branch["group"] = None
                branch["include_targets"] = None
            branches.append(branch)

        return {
            "aggregate_op": aggregate_op,
            "measure_field": measure_field,
            "selector_kind": selector_kind,
            "selector_field": selector_field,
            "selector_values": selector_values,
            "branches": branches,
            "warnings": warnings,
        }

    def _ground_syntax_features(
        self,
        resolved_text: str,
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Ground words in the dependency tokens to chart components using chart_context.
        This mirrors Stage 2's "visual-to-non-visual conversion" idea but tailored to
        non-visual analytic questions:
        - field mentions (measure/dimension/series)
        - categorical value mentions (mapped to a field, prioritizing series_field)
        - operator mentions (avg/sum/etc.)
        - scope mentions (across/over clauses)
        """
        fields = chart_context.get("fields", []) or []
        dimension_fields = set(chart_context.get("dimension_fields", []) or [])
        measure_fields = set(chart_context.get("measure_fields", []) or [])
        primary_dimension = str(chart_context.get("primary_dimension") or "").strip()
        primary_measure = str(chart_context.get("primary_measure") or "").strip()
        series_field = chart_context.get("series_field")
        series_field = str(series_field).strip() if isinstance(series_field, str) and series_field.strip() else None

        def norm_surface(text: str) -> str:
            return re.sub(r"[^A-Za-z0-9_\\-]+", "", str(text or "")).strip().lower()

        field_by_norm: Dict[str, str] = {}
        for field in fields:
            key = norm_surface(field)
            if key:
                field_by_norm[key] = field

        categorical_values: Dict[str, List[str]] = chart_context.get("categorical_values", {}) or {}
        value_by_norm: Dict[str, List[Tuple[str, str]]] = {}
        for field_name, values in categorical_values.items():
            for value in values:
                key = norm_surface(value)
                if not key:
                    continue
                value_by_norm.setdefault(key, []).append((field_name, str(value)))

        def infer_field_component(field_name: str) -> str:
            if series_field and field_name == series_field:
                return "legend_field"
            if field_name in measure_fields or (primary_measure and field_name == primary_measure):
                return "y_axis_field"
            if field_name in dimension_fields or (primary_dimension and field_name == primary_dimension):
                return "x_axis_field"
            return "field"

        def choose_value_field(candidates: List[Tuple[str, str]]) -> Optional[Tuple[str, str]]:
            if not candidates:
                return None
            if series_field:
                for field_name, value in candidates:
                    if field_name == series_field:
                        return (field_name, value)
            if primary_dimension:
                for field_name, value in candidates:
                    if field_name == primary_dimension:
                        return (field_name, value)
            return candidates[0]

        grounded_fields: List[Dict[str, Any]] = []
        grounded_values: List[Dict[str, Any]] = []
        grounded_operators: List[Dict[str, Any]] = []
        grounded_scopes: List[Dict[str, Any]] = []

        for feature in syntax_features:
            tokens = feature.get("tokens", []) or []
            token_by_id: Dict[int, Dict[str, Any]] = {
                int(token["id"]): token for token in tokens if isinstance(token, dict) and isinstance(token.get("id"), int)
            }

            children: Dict[int, List[int]] = {}
            for token in tokens:
                token_id = token.get("id")
                head_id = token.get("head")
                if not isinstance(token_id, int) or not isinstance(head_id, int):
                    continue
                children.setdefault(head_id, []).append(token_id)
            for key in children:
                children[key].sort()

            def phrase_from_subtree(root_id: int) -> str:
                visited: Set[int] = set()
                stack = [root_id]
                while stack:
                    current = stack.pop()
                    if current in visited:
                        continue
                    visited.add(current)
                    stack.extend(children.get(current, []))
                ordered = sorted(visited)
                parts: List[str] = []
                for token_id in ordered:
                    token = token_by_id.get(token_id)
                    if not token:
                        continue
                    parts.append(str(token.get("text") or ""))
                return re.sub(r"\\s+", " ", " ".join(parts)).strip()

            def collect_descriptors(anchor_id: int) -> List[str]:
                visited: Set[int] = set()
                queue: deque[int] = deque([anchor_id])
                out_terms: List[str] = []
                while queue:
                    current = queue.popleft()
                    if current in visited:
                        continue
                    visited.add(current)
                    token = token_by_id.get(current)
                    if not token:
                        continue
                    lemma = str(token.get("lemma") or token.get("text") or "").strip().lower()
                    lemma = re.sub(r"[^a-z0-9_\\-]+", "", lemma)
                    if lemma and lemma not in out_terms:
                        out_terms.append(lemma)

                    head_id = token.get("head")
                    deprel = str(token.get("deprel") or "").strip().lower()
                    if isinstance(head_id, int) and head_id in token_by_id and head_id not in visited:
                        if deprel in DEPENDENCY_ALLOWLIST:
                            queue.append(head_id)
                    for child_id in children.get(current, []):
                        child = token_by_id.get(child_id)
                        if not child:
                            continue
                        child_rel = str(child.get("deprel") or "").strip().lower()
                        if child_rel in DEPENDENCY_ALLOWLIST and child_id not in visited:
                            queue.append(child_id)
                return out_terms

            for token in tokens:
                token_id = token.get("id")
                if not isinstance(token_id, int):
                    continue
                raw = str(token.get("lemma") or token.get("text") or "").strip()
                key = norm_surface(raw)
                if not key:
                    continue

                if key in field_by_norm:
                    field_name = field_by_norm[key]
                    grounded_fields.append(
                        {
                            "sentence_index": feature.get("sentence_index"),
                            "token_id": token_id,
                            "text": str(token.get("text") or ""),
                            "field": field_name,
                            "component": infer_field_component(field_name),
                            "descriptors": collect_descriptors(token_id),
                        }
                    )

                if key in value_by_norm:
                    chosen = choose_value_field(value_by_norm[key])
                    if chosen:
                        field_name, value = chosen
                        component = "legend_value" if series_field and field_name == series_field else "data_value"
                        grounded_values.append(
                            {
                                "sentence_index": feature.get("sentence_index"),
                                "token_id": token_id,
                                "text": str(token.get("text") or ""),
                                "field": field_name,
                                "value": value,
                                "component": component,
                                "descriptors": collect_descriptors(token_id),
                            }
                        )

                op = AGGREGATE_OPERATION_KEYWORDS.get(key)
                if op:
                    grounded_operators.append(
                        {
                            "sentence_index": feature.get("sentence_index"),
                            "token_id": token_id,
                            "text": str(token.get("text") or ""),
                            "operation": op,
                        }
                    )

                if key in {"across", "over"} and str(token.get("deprel") or "").strip().lower() == "case":
                    head_id = token.get("head")
                    if isinstance(head_id, int) and head_id in token_by_id:
                        grounded_scopes.append(
                            {
                                "sentence_index": feature.get("sentence_index"),
                                "token_id": head_id,
                                "text": phrase_from_subtree(head_id),
                                "component": "scope",
                            }
                        )

        grounding_summary = {
            "operators": grounded_operators,
            "fields": grounded_fields,
            "values": grounded_values,
            "scopes": grounded_scopes,
            # Also keep a cheap global signal for debugging.
            "scope_clauses": self._extract_scope_clauses(resolved_text),
        }
        return grounding_summary

    def _render_lambda_prompt(
        self,
        resolved_text: str,
        syntax_features: List[Dict[str, Any]],
        chart_context: Dict[str, Any],
        lambda_hints: Dict[str, Any],
        mark_terms: List[str],
        visual_terms: List[str],
        rewrite_trace: List[Dict[str, str]],
    ) -> str:
        template_text = self.lambda_prompt_template
        if not template_text:
            raise RuntimeError("lambda prompt template is not loaded.")

        template = Template(template_text)
        return template.safe_substitute(
            resolved_text=resolved_text,
            syntax_json=json.dumps(syntax_features, ensure_ascii=True, indent=2),
            chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
            lambda_hints_json=json.dumps(lambda_hints, ensure_ascii=True, indent=2),
            mark_terms_json=json.dumps(mark_terms, ensure_ascii=True),
            visual_terms_json=json.dumps(visual_terms, ensure_ascii=True),
            rewrite_trace_json=json.dumps(rewrite_trace, ensure_ascii=True, indent=2),
            operations_json=json.dumps(self.dsl_operations, ensure_ascii=True, indent=2),
        )

    def _build_llm_response_model(self, operation_keys: List[str]) -> Type[BaseModel]:
        if not operation_keys:
            raise RuntimeError("DSL operation list is empty.")

        operation_literal = self._make_literal_type(operation_keys)

        step_model = create_model(
            "ConstrainedLambdaStep",
            __config__=ConfigDict(extra="forbid"),
            step=(int, Field(..., ge=1)),
            operation=(operation_literal, ...),
            target=(Optional[str], None),
            target_a=(Optional[str], None),
            target_b=(Optional[str], None),
            group=(Optional[str], None),
            group_by=(Optional[str], None),
            condition=(Optional[str], None),
            output_variable=(Optional[str], None),
            input_variable=(Optional[str], None),
            field=(Optional[str], None),
            value=(Optional[Any], None),
            operator=(Optional[str], None),
            which=(Optional[str], None),
            order=(Optional[str], None),
            order_field=(Optional[str], None),
            n=(Optional[int], None),
            from_=(Optional[str], Field(default=None, alias="from")),
            mode=(Optional[str], None),
            signed=(Optional[bool], None),
            aggregate=(Optional[str], None),
            precision=(Optional[int], None),
            branch=(Optional[str], None),
        )

        response_model = create_model(
            "ConstrainedLLMParseOutput",
            __config__=ConfigDict(extra="forbid"),
            lambda_expression=(List[step_model], Field(default_factory=list)),
        )

        return response_model

    def _build_ops_spec_response_model(self, ops_names: List[str]) -> Type[BaseModel]:
        if not ops_names:
            raise RuntimeError("OperationSpec operation list is empty.")

        op_literal = self._make_literal_type(ops_names)
        group_name_pattern = r"^(ops(\\d+)?|last|[A-Za-z][A-Za-z0-9_]*)$"

        op_model = create_model(
            "ConstrainedOpsSpecOperation",
            __config__=ConfigDict(extra="allow"),
            op=(op_literal, ...),
            chartId=(Optional[str], None),
            field=(Optional[str], None),
            include=(Optional[List[PrimitiveFilterValue]], None),
            exclude=(Optional[List[PrimitiveFilterValue]], None),
            operator=(Optional[str], None),
            value=(Optional[Any], None),
            group=(Optional[str], None),
            groupA=(Optional[str], None),
            groupB=(Optional[str], None),
            aggregate=(Optional[str], None),
            which=(Optional[str], None),
            order=(Optional[str], None),
            orderField=(Optional[str], None),
            signed=(Optional[bool], None),
            mode=(Optional[str], None),
            percent=(Optional[bool], None),
            scale=(Optional[float], None),
            precision=(Optional[int], None),
            target=(Optional[Any], None),
            targetA=(Optional[Any], None),
            targetB=(Optional[Any], None),
            targetName=(Optional[str], None),
            n=(Optional[Any], None),
            from_=(Optional[str], Field(default=None, alias="from")),
            absolute=(Optional[bool], None),
            seconds=(Optional[float], None),
            duration=(Optional[float], None),
            id=(Optional[str], None),
            key=(Optional[str], None),
        )

        group_model = create_model(
            "ConstrainedOpsSpecGroup",
            __config__=ConfigDict(extra="forbid"),
            name=(str, Field(..., pattern=group_name_pattern)),
            ops=(List[op_model], Field(default_factory=list)),
        )

        response_model = create_model(
            "ConstrainedOpsSpecOutput",
            __config__=ConfigDict(extra="forbid"),
            groups=(List[group_model], Field(default_factory=list)),
        )
        return response_model

    def _load_lambda_prompt_template(self) -> str:
        prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "nl_to_lambda_prompt.md")
        try:
            with open(prompt_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
        except Exception as exc:
            raise RuntimeError(f"Failed to load lambda prompt file at {prompt_path}: {exc}") from exc
        if not content:
            raise RuntimeError(f"lambda prompt file is empty: {prompt_path}")
        return content

    def _load_ops_spec_prompt_template(self) -> str:
        prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "lambda_to_ops_spec_prompt.md")
        try:
            with open(prompt_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
        except Exception as exc:
            raise RuntimeError(f"Failed to load opsSpec prompt file at {prompt_path}: {exc}") from exc
        if not content:
            raise RuntimeError(f"opsSpec prompt file is empty: {prompt_path}")
        return content

    def _validate_step_operations(self, steps: List[Dict[str, Any]]) -> None:
        allowed = set(self.dsl_operations.keys())
        for index, step in enumerate(steps, start=1):
            operation = step.get("operation")
            if operation not in allowed:
                raise RuntimeError(
                    f"Invalid operation at step {index}: '{operation}'. Allowed operations: {sorted(allowed)}"
                )

    def _make_literal_type(self, values: List[str]) -> Any:
        from typing import Literal

        return Literal.__getitem__(tuple(values))

    def _extract_first_by_relation(
        self,
        words: List[Any],
        children: Dict[int, List[int]],
        relations: List[str],
    ) -> Optional[str]:
        for relation in relations:
            for word in words:
                if word.deprel == relation:
                    return self._phrase_from_subtree(words, word.id, children)
        return None

    def _build_children_map(self, words: List[Any]) -> Dict[int, List[int]]:
        children: Dict[int, List[int]] = {word.id: [] for word in words}
        for word in words:
            if word.head in children:
                children[word.head].append(word.id)
        for key in children:
            children[key].sort()
        return children

    def _word_by_id(self, words: List[Any]) -> Dict[int, Any]:
        return {word.id: word for word in words}

    def _collect_sentence_descriptive_terms(self, words: List[Any], mark_terms: List[str]) -> Set[str]:
        if not mark_terms:
            return set()

        children = self._build_children_map(words)
        word_by_id = self._word_by_id(words)

        anchor_ids: List[int] = []
        for word in words:
            term = (word.lemma or word.text or "").lower()
            if term in mark_terms:
                anchor_ids.append(word.id)

        terms: Set[str] = set()
        for anchor_id in anchor_ids:
            terms |= self._collect_descriptive_terms_from_anchor(anchor_id, words, word_by_id, children)

        if not terms:
            for word in words:
                lemma = (word.lemma or word.text or "").strip().lower()
                if lemma:
                    terms.add(lemma)
        return terms

    def _collect_descriptive_terms_from_anchor(
        self,
        anchor_id: int,
        words: List[Any],
        word_by_id: Dict[int, Any],
        children: Dict[int, List[int]],
    ) -> Set[str]:
        visited: Set[int] = set()
        queue: deque[int] = deque([anchor_id])
        terms: Set[str] = set()

        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)

            current_word = word_by_id.get(current)
            if current_word is None:
                continue

            lemma = (current_word.lemma or current_word.text or "").strip().lower()
            if lemma:
                terms.add(lemma)

            parent_id = current_word.head
            if parent_id in word_by_id and parent_id not in visited:
                if (current_word.deprel or "") in DEPENDENCY_ALLOWLIST:
                    queue.append(parent_id)

            for child_id in children.get(current, []):
                child = word_by_id.get(child_id)
                if child is None:
                    continue
                if (child.deprel or "") in DEPENDENCY_ALLOWLIST and child_id not in visited:
                    queue.append(child_id)

        return terms

    def _detect_mark_terms(self, text: str) -> List[str]:
        tokens = re.findall(r"[A-Za-z]+", text.lower())
        marks: Set[str] = set()
        all_terms = set().union(*MARK_LEXICON.values())
        for token in tokens:
            if token in all_terms:
                marks.add(token)
        return sorted(marks)

    def _collect_descriptive_terms(self, syntax_features: List[Dict[str, Any]]) -> Set[str]:
        terms: Set[str] = set()
        for feature in syntax_features:
            for token in feature.get("descriptive_terms", []) or []:
                text = str(token).strip().lower()
                if text:
                    terms.add(text)
        return terms

    def _detect_visual_attribute_terms(self, descriptive_terms: Set[str]) -> List[str]:
        attr_terms = set().union(*VISUAL_ATTRIBUTE_LEXICON.values())
        matched = [term for term in sorted(descriptive_terms) if term in attr_terms]
        return matched

    def _detect_visual_operation_terms(self, descriptive_terms: Set[str]) -> List[str]:
        matched = [term for term in sorted(descriptive_terms) if term in VISUAL_OPERATION_LEXICON]
        return matched

    def _build_rewrite_trace(
        self,
        text: str,
        mark_terms: List[str],
        visual_attribute_terms: List[str],
        visual_operation_terms: List[str],
    ) -> List[Dict[str, str]]:
        trace: List[Dict[str, str]] = []
        rewritten = text

        if mark_terms:
            before = rewritten
            pattern = re.compile(r"\\b(" + "|".join(re.escape(term) for term in mark_terms) + r")\\b", re.IGNORECASE)
            rewritten = pattern.sub("data", rewritten)
            trace.append({"step": "mark_detection", "before": before, "after": rewritten})

        if visual_attribute_terms:
            before = rewritten
            for term in visual_attribute_terms:
                rewritten = re.sub(rf"\\b{re.escape(term)}\\b", "value", rewritten, flags=re.IGNORECASE)
            trace.append({"step": "visual_attribute_detection", "before": before, "after": rewritten})

        if visual_operation_terms:
            before = rewritten
            for term in visual_operation_terms:
                operation, _ = VISUAL_OPERATION_LEXICON[term]
                replacement = operation.lower()
                rewritten = re.sub(rf"\\b{re.escape(term)}\\b", replacement, rewritten, flags=re.IGNORECASE)
            trace.append({"step": "visual_operation_detection", "before": before, "after": rewritten})

        if not trace:
            trace.append({"step": "no_rewrite", "before": text, "after": text})

        return trace

    def _phrase_from_subtree(self, words: List[Any], root_id: int, children: Dict[int, List[int]]) -> str:
        word_by_id = {word.id: word for word in words}

        stack = [root_id]
        visited = set()
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            stack.extend(children.get(current, []))

        ordered_ids = sorted(visited)
        phrase = " ".join(word_by_id[idx].text for idx in ordered_ids if idx in word_by_id)
        phrase = re.sub(r"\\s+", " ", phrase).strip()
        return phrase

    def _resolve_instructor_mode(self) -> Any:
        if instructor is None:
            return None

        preferred_modes = ["JSON_SCHEMA", "JSON", "TOOLS"]
        for mode_name in preferred_modes:
            mode = getattr(instructor.Mode, mode_name, None)
            if mode is not None:
                return mode

        raise RuntimeError("Instructor Mode.JSON_SCHEMA/JSON/TOOLS is not available in current version.")

    def _validate_loaded(self, require_llm: bool = True) -> None:
        if self.stanza_pipeline is None:
            raise RuntimeError("Stanza pipeline is not loaded. Call load() first.")
        if require_llm and self.llm_backend is None:
            raise RuntimeError("LLM backend is not loaded. Call load() first.")
        if require_llm and self.llm_response_model is None:
            raise RuntimeError("Constrained response model is not loaded. Call load() first.")
        if require_llm and self.lambda_prompt_template is None:
            raise RuntimeError("Lambda prompt template is not loaded. Call load() first.")
        if require_llm and self.ops_spec_response_model is None:
            raise RuntimeError("opsSpec response model is not loaded. Call load() first.")
        if require_llm and self.ops_spec_prompt_template is None:
            raise RuntimeError("opsSpec prompt template is not loaded. Call load() first.")

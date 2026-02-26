from __future__ import annotations

import json
import logging
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from draw_plan import build_draw_ops_spec, export_draw_plan_to_public

from ..runtime.canonicalize import canonicalize_ops_spec_groups
from ..runtime.context_builder import build_chart_context
from ..core.llm import StructuredLLMClient
from ..core.utils import prune_nulls
from ..core.models import ChartContext, GenerateOpsSpecResponse, GroundedPlanTree, PipelineTrace, PlanTree
from .module_decompose import run_decompose_module
from .module_resolve import run_resolve_module
from .module_specify import run_specify_module
from ..runtime.op_registry import build_ops_contract_for_prompt
from ..validation.plan_validators import infer_goal_type, validate_plan_against_intent, validate_plan_tree
from ..specs.union import OperationSpec, parse_operation_spec
from ..validation.validators import validate_operation

logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("pipeline_trace")


def _load_prompt(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise RuntimeError(f"Prompt file is empty: {path}")
    return text


def _debug_root_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "debug"


def _create_debug_session_dir() -> Path:
    base = _debug_root_dir()
    base.mkdir(parents=True, exist_ok=True)
    stem = datetime.now().strftime("%m%d%H%M")
    candidate = base / stem
    if not candidate.exists():
        candidate.mkdir(parents=True, exist_ok=False)
        return candidate
    suffix = 1
    while True:
        alt = base / f"{stem}_{suffix:02d}"
        if not alt.exists():
            alt.mkdir(parents=True, exist_ok=False)
            return alt
        suffix += 1


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(prune_nulls(payload), ensure_ascii=False, indent=2), encoding="utf-8")


def _escape_dot_label(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _group_color(name: str) -> str:
    if name == "ops":
        return "#e8f0fe"
    if name.startswith("ops"):
        return "#e8f5e9"
    return "#f5f5f5"


def _build_ops_spec_dot(groups: Dict[str, Any]) -> str:
    # Build a DOT graph from final ops_spec groups.
    # Each op is a node: meta.nodeId is used as the stable identifier.
    # Edges follow meta.inputs (tree/DAG structure).
    node_meta: Dict[str, Dict[str, str]] = {}
    edges: List[Tuple[str, str]] = []

    for group_name, ops in (groups or {}).items():
        if not isinstance(group_name, str) or not isinstance(ops, list):
            continue
        for op in ops:
            if not isinstance(op, dict):
                continue
            meta = op.get("meta") if isinstance(op.get("meta"), dict) else {}
            node_id = meta.get("nodeId") or op.get("id")
            if not isinstance(node_id, str) or not node_id:
                continue
            op_name = op.get("op")
            label_parts = [str(node_id)]
            if isinstance(op_name, str) and op_name:
                label_parts.append(op_name)
            if isinstance(group_name, str) and group_name:
                label_parts.append(f"({group_name})")

            # Add a few useful params (small and stable) for debugging.
            field = op.get("field")
            if isinstance(field, str) and field:
                label_parts.append(f"field={field}")
            group = op.get("group")
            if isinstance(group, str) and group:
                label_parts.append(f"group={group}")
            fn = op.get("fn")
            if isinstance(fn, str) and fn:
                label_parts.append(f"fn={fn}")

            node_meta[node_id] = {
                "label": " ".join(label_parts),
                "group": group_name,
            }

            inputs = meta.get("inputs")
            if isinstance(inputs, list):
                for inp in inputs:
                    if isinstance(inp, str) and inp:
                        edges.append((inp, node_id))

    lines: List[str] = []
    lines.append("digraph OpsSpecTree {")
    lines.append('  graph [rankdir=LR, bgcolor="white"];')
    lines.append('  node [shape=box, style="rounded,filled", fillcolor="white", fontname="Helvetica"];')
    lines.append('  edge [color="#666666"];')

    groups_by_name: Dict[str, List[str]] = {}
    for node_id, meta in node_meta.items():
        groups_by_name.setdefault(meta["group"], []).append(node_id)

    def _group_sort_key(name: str) -> tuple[int, int, str]:
        if name == "ops":
            return (0, 1, name)
        if name.startswith("ops") and name[3:].isdigit():
            try:
                return (0, int(name[3:]), name)
            except Exception:
                return (0, 9999, name)
        return (1, 9999, name)

    for group_name, node_ids in sorted(groups_by_name.items(), key=lambda item: _group_sort_key(item[0])):
        cluster_name = f"cluster_{group_name}"
        lines.append(f'  subgraph "{cluster_name}" {{')
        lines.append(f'    label="{_escape_dot_label(group_name)}";')
        lines.append('    color="#bbbbbb";')
        lines.append(f'    style="rounded,filled";')
        lines.append(f'    fillcolor="{_group_color(group_name)}";')
        for node_id in sorted(node_ids):
            label = node_meta[node_id]["label"]
            lines.append(f'    "{node_id}" [label="{_escape_dot_label(label)}"];')
        lines.append("  }")

    for src, dst in edges:
        if src in node_meta and dst in node_meta:
            lines.append(f'  "{src}" -> "{dst}";')
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def _try_render_dot(dot_path: Path, *, out_base: Path) -> List[str]:
    # Render DOT via Graphviz if available. We avoid extra Python deps.
    warnings: List[str] = []
    dot_bin = shutil.which("dot")
    if not dot_bin:
        warnings.append('Graphviz "dot" not found in PATH; wrote .dot only.')
        return warnings

    try:
        svg_path = out_base.with_suffix(".svg")
        png_path = out_base.with_suffix(".png")
        subprocess.run([dot_bin, "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True, capture_output=True, text=True)
        subprocess.run([dot_bin, "-Tpng", str(dot_path), "-o", str(png_path)], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        warnings.append(f'Graphviz render failed: {stderr or exc}')
    except Exception as exc:
        warnings.append(f"Graphviz render failed: {exc}")
    return warnings


def _persist_debug_bundle(payloads: Dict[str, Dict[str, Any]]) -> Path:
    session_dir = _create_debug_session_dir()
    ordered = [
        ("00_request.json", "request"),
        ("01_context.json", "context"),
        ("02_module1_decompose.json", "module1_decompose"),
        # Module 2 Resolve: step-level + final
        ("03_module2_resolve_step1.json", "module2_resolve_step1"),
        ("03_module2_resolve_step2.json", "module2_resolve_step2"),
        ("03_module2_resolve_step3_llm.json", "module2_resolve_step3_llm"),
        ("03_module2_resolve_final.json", "module2_resolve_final"),
        ("04_module3_specify.json", "module3_specify"),
        ("05_final_grammar.json", "final_grammar"),
        ("06_draw_plan.json", "draw_plan"),
        ("99_error.json", "error"),
    ]
    for filename, key in ordered:
        data = payloads.get(key)
        if data is None:
            continue
        _write_json(session_dir / filename, data)

    # Tree visualization (OpsSpec only): DOT always, SVG/PNG if graphviz is available.
    final_payload = payloads.get("final_grammar") or {}
    if isinstance(final_payload, dict):
        ops_spec = final_payload.get("ops_spec")
        if isinstance(ops_spec, dict):
            dot_text = _build_ops_spec_dot(ops_spec)
            dot_path = session_dir / "07_tree_ops_spec.dot"
            dot_path.write_text(dot_text, encoding="utf-8")
            render_warnings = _try_render_dot(dot_path, out_base=session_dir / "07_tree_ops_spec")
            if render_warnings:
                (session_dir / "07_tree_ops_spec_render_warnings.txt").write_text(
                    "\n".join(render_warnings) + "\n",
                    encoding="utf-8",
                )
    return session_dir


def _parse_and_validate_groups(
    *,
    raw_groups: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    parsed_groups: Dict[str, List[OperationSpec]] = {}
    validation_warnings: List[str] = []
    errors: List[str] = []

    for group_name, ops in raw_groups.items():
        if not isinstance(group_name, str):
            errors.append("Group name must be string.")
            continue
        if group_name == "last":
            errors.append('Group "last" is not allowed. Use sentence-layer groups only: "ops", "ops2", "ops3", ...')
            continue
        if group_name != "ops":
            if not group_name.startswith("ops") or not group_name[3:].isdigit() or int(group_name[3:]) < 2:
                errors.append(
                    f'Invalid group name "{group_name}". Use sentence-layer groups only: "ops", "ops2", "ops3", ...'
                )
                continue
        if not isinstance(ops, list):
            errors.append(f'{group_name}: group value must be list, got "{type(ops).__name__}"')
            continue

        group_ops: List[OperationSpec] = []
        for idx, raw_op in enumerate(ops):
            if not isinstance(raw_op, dict):
                errors.append(f"{group_name}[{idx}]: op entry must be object.")
                continue
            try:
                op = parse_operation_spec(raw_op)
            except Exception as exc:
                errors.append(f"{group_name}[{idx}] schema error: {exc}")
                continue

            try:
                normalized, op_warnings = validate_operation(op, chart_context=chart_context)
            except Exception as exc:
                errors.append(f"{group_name}[{idx}] semantic error: {exc}")
                continue

            group_ops.append(normalized)
            validation_warnings.extend([f"{group_name}[{idx}]: {msg}" for msg in op_warnings])
        parsed_groups[group_name] = group_ops

    if errors:
        raise ValueError("\n".join(errors))
    return parsed_groups, validation_warnings


def _validate_compiled_groups_match_plan(
    *,
    plan_tree: GroundedPlanTree,
    compiled_groups: Dict[str, List[OperationSpec]],
) -> None:
    """
    Specify output must be a faithful translation of the plan:
    - Every plan nodeId must appear exactly once as an OperationSpec meta.nodeId.
    - No extra nodes are allowed.
    - Group placement must match plan node.group.
    - meta.sentenceIndex must match plan node.sentenceIndex.
    """
    plan_nodes = list(plan_tree.nodes or [])
    plan_ids = [n.nodeId for n in plan_nodes]
    plan_by_id = {n.nodeId: n for n in plan_nodes}

    compiled_by_id: Dict[str, Tuple[str, OperationSpec]] = {}
    for group_name, ops in compiled_groups.items():
        for op in ops:
            node_id = (op.meta.nodeId if op.meta else None) or op.id
            if not isinstance(node_id, str) or not node_id:
                continue
            compiled_by_id[node_id] = (group_name, op)

    compiled_ids = set(compiled_by_id.keys())
    missing = sorted(set(plan_ids) - compiled_ids)
    extra = sorted(compiled_ids - set(plan_ids))
    errors: List[str] = []
    if missing:
        errors.append(f"specify output missing nodeIds from plan_tree: {missing[:12]}")
    if extra:
        errors.append(f"specify output has extra nodeIds not in plan_tree: {extra[:12]}")

    for node_id, plan_node in plan_by_id.items():
        entry = compiled_by_id.get(node_id)
        if not entry:
            continue
        compiled_group, op = entry
        if compiled_group != plan_node.group:
            errors.append(
                f'nodeId "{node_id}" must be placed in group "{plan_node.group}" (got "{compiled_group}").'
            )
        if not op.meta or op.meta.sentenceIndex is None:
            errors.append(f'nodeId "{node_id}" is missing meta.sentenceIndex.')
        elif op.meta.sentenceIndex != plan_node.sentenceIndex:
            errors.append(
                f'nodeId "{node_id}" meta.sentenceIndex must be {plan_node.sentenceIndex} (got {op.meta.sentenceIndex}).'
            )

    if errors:
        raise ValueError("\n".join(errors))


def _is_grounding_error(errors: List[str]) -> bool:
    """Module 3 실패가 그라운딩 문제(필드/값 미존재)에서 비롯됐는지 판단."""
    grounding_keywords = ("does not exist", "not in", "field", "domain", "not found", "semantic error")
    combined = " ".join(errors).lower()
    return any(kw in combined for kw in grounding_keywords)


class OpsSpecPipeline:
    def __init__(
        self,
        *,
        ollama_model: str,
        ollama_base_url: str,
        ollama_api_key: str,
        prompts_dir: Path,
    ) -> None:
        self.llm = StructuredLLMClient(
            ollama_model=ollama_model,
            ollama_base_url=ollama_base_url,
            ollama_api_key=ollama_api_key,
        )
        self.prompts_dir = prompts_dir
        self.decompose_prompt: str | None = None
        self.resolve_prompt: str | None = None
        self.specify_prompt: str | None = None
        self.shared_rules_prompt: str | None = None

    def load(self) -> None:
        self.llm.load()
        if (
            self.decompose_prompt
            and self.resolve_prompt
            and self.specify_prompt
            and self.shared_rules_prompt is not None
        ):
            return
        self.decompose_prompt = _load_prompt(self.prompts_dir / "opsspec_decompose.md")
        self.resolve_prompt = _load_prompt(self.prompts_dir / "opsspec_resolve.md")
        self.specify_prompt = _load_prompt(self.prompts_dir / "opsspec_specify.md")
        shared_rules_path = self.prompts_dir / "opsspec_shared_rules.md"
        self.shared_rules_prompt = _load_prompt(shared_rules_path) if shared_rules_path.exists() else ""

    def generate(
        self,
        *,
        question: str,
        explanation: str,
        vega_lite_spec: Dict[str, Any],
        data_rows: List[Dict[str, Any]],
        request_id: str,
        debug: bool,
    ) -> GenerateOpsSpecResponse:
        self.load()
        assert self.decompose_prompt is not None
        assert self.resolve_prompt is not None
        assert self.specify_prompt is not None
        assert self.shared_rules_prompt is not None

        debug_payloads: Dict[str, Dict[str, Any]] = {
            "request": {
                "request_id": request_id,
                "question": question,
                "explanation": explanation,
                "vega_lite_spec": vega_lite_spec,
                "data_rows": data_rows,
                "debug": debug,
            }
        }

        chart_context, context_warnings, rows_preview = build_chart_context(vega_lite_spec, data_rows)
        debug_payloads["context"] = {
            "chart_context": chart_context.model_dump(mode="json"),
            "context_warnings": context_warnings,
            "rows_preview": rows_preview,
        }
        trace_logger.info(
            "[request:%s] context_built | fields=%d series_field=%s",
            request_id,
            len(chart_context.fields),
            chart_context.series_field or "-",
        )

        # ---
        # Module 1: Explanation Decomposition
        # ---
        decompose_payload: Dict[str, Any] = {}
        decompose_feedback: List[str] = []
        decompose_retry_notes: List[str] = []
        max_decompose_attempts = 3

        roles_summary = {
            "primary_measure": chart_context.primary_measure,
            "primary_dimension": chart_context.primary_dimension,
            "series_field": chart_context.series_field,
        }
        deterministic_goal_type = infer_goal_type(question)
        series_domain = []
        if chart_context.series_field:
            series_domain = list(chart_context.categorical_values.get(chart_context.series_field, []))
        measure_fields = list(chart_context.measure_fields)

        for attempt in range(1, max_decompose_attempts + 1):
            try:
                decompose_payload = run_decompose_module(
                    llm=self.llm,
                    prompt_template=self.decompose_prompt,
                    shared_rules=self.shared_rules_prompt,
                    question=question,
                    explanation=explanation,
                    chart_context=chart_context.model_dump(mode="json"),
                    roles_summary=roles_summary,
                    series_domain=series_domain,
                    measure_fields=measure_fields,
                    rows_preview=rows_preview,
                    validation_feedback=decompose_feedback,
                )

                debug_payloads["module1_decompose"] = {
                    **decompose_payload,
                    "goal_type": deterministic_goal_type,
                    "attempt": attempt,
                    "validation_feedback_in": decompose_feedback,
                }

                plan_tree = decompose_payload.get("plan_tree")
                if not isinstance(plan_tree, dict):
                    raise ValueError("plan_tree must be an object.")
                plan_tree_model = PlanTree.model_validate(plan_tree)
                validate_plan_tree(plan_tree_model)
                validate_plan_against_intent(
                    plan_tree=plan_tree_model,
                    question=question,
                    explanation=explanation,
                    chart_context=chart_context,
                )
                break
            except Exception as exc:
                decompose_feedback = [line for line in str(exc).splitlines() if line.strip()]
                decompose_retry_notes.append(
                    f"decompose attempt {attempt}/{max_decompose_attempts} failed with {len(decompose_feedback)} validation errors"
                )
                trace_logger.warning(
                    "[request:%s] decompose_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_decompose_attempts,
                    len(decompose_feedback),
                )
                if attempt == max_decompose_attempts:
                    debug_payloads["error"] = {
                        "stage": "decompose_retry_exhausted",
                        "errors": decompose_feedback,
                        "attempts": max_decompose_attempts,
                    }
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "decompose_plan failed after strict retries: " + "; ".join(decompose_feedback[:8])
                    ) from exc

        goal_type = deterministic_goal_type
        trace_logger.info(
            "[request:%s] decompose_plan | goal_type=%s nodes=%d warnings=%d",
            request_id,
            goal_type,
            len(((decompose_payload.get("plan_tree") or {}).get("nodes") or [])),
            len(decompose_payload.get("warnings") or []),
        )

        # ---
        # Module 2: Chart-Grounded Resolution
        # ---
        resolve_payload: Dict[str, Any] = {}
        resolve_feedback: List[str] = []
        resolve_retry_notes: List[str] = []
        max_resolve_attempts = 3

        for attempt in range(1, max_resolve_attempts + 1):
            try:
                resolve_payload = run_resolve_module(
                    llm=self.llm,
                    prompt_template=self.resolve_prompt,
                    shared_rules=self.shared_rules_prompt,
                    plan_tree=decompose_payload.get("plan_tree") or {},
                    chart_context=chart_context,
                    rows_preview=rows_preview,
                    validation_feedback=resolve_feedback,
                )

                debug_steps = resolve_payload.pop("_debug_steps", {})
                if debug_steps.get("step1_token_resolved"):
                    debug_payloads["module2_resolve_step1"] = {
                        "plan_tree": debug_steps["step1_token_resolved"],
                        "attempt": attempt,
                    }
                if debug_steps.get("step2_value_resolved"):
                    debug_payloads["module2_resolve_step2"] = {
                        "plan_tree": debug_steps["step2_value_resolved"],
                        "attempt": attempt,
                    }
                if debug_steps.get("step3_llm_called"):
                    debug_payloads["module2_resolve_step3_llm"] = {
                        "llm_called": True,
                        "attempt": attempt,
                    }
                debug_payloads["module2_resolve_final"] = {
                    **resolve_payload,
                    "attempt": attempt,
                    "validation_feedback_in": resolve_feedback,
                }
                break
            except Exception as exc:
                resolve_feedback = [line for line in str(exc).splitlines() if line.strip()]
                resolve_retry_notes.append(
                    f"resolve attempt {attempt}/{max_resolve_attempts} failed with {len(resolve_feedback)} errors"
                )
                trace_logger.warning(
                    "[request:%s] resolve_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_resolve_attempts,
                    len(resolve_feedback),
                )
                if attempt == max_resolve_attempts:
                    debug_payloads["error"] = {
                        "stage": "resolve_retry_exhausted",
                        "errors": resolve_feedback,
                        "attempts": max_resolve_attempts,
                    }
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "resolve_plan failed after strict retries: " + "; ".join(resolve_feedback[:8])
                    ) from exc

        trace_logger.info(
            "[request:%s] resolve_plan | llm_called=%s nodes=%d warnings=%d",
            request_id,
            resolve_payload.get("llm_called", False),
            len(((resolve_payload.get("grounded_plan_tree") or {}).get("nodes") or [])),
            len(resolve_payload.get("warnings") or []),
        )

        # ─────────────────────────────────────────────────────────
        # Module 3: Grammar Specification (with retry + cross-module feedback)
        # ─────────────────────────────────────────────────────────
        ops_contract = build_ops_contract_for_prompt()
        specify_payload: Dict[str, Any] = {}
        validation_warnings: List[str] = []
        specify_retry_notes: List[str] = []
        parsed_groups: Dict[str, List[OperationSpec]] = {}

        feedback_errors: List[str] = []
        max_specify_attempts = 3
        grounded_plan_tree_dict = resolve_payload.get("grounded_plan_tree") or {}
        # cross-module 재시도 플래그: Module 3 실패가 그라운딩 문제이면 Module 2를 1회 재실행
        _cross_module_retry_used = False

        for attempt in range(1, max_specify_attempts + 1):
            specify_payload = run_specify_module(
                llm=self.llm,
                prompt_template=self.specify_prompt,
                shared_rules=self.shared_rules_prompt,
                grounded_plan_tree=grounded_plan_tree_dict,
                chart_context=chart_context.model_dump(mode="json"),
                ops_contract=ops_contract,
                validation_feedback=feedback_errors,
            )
            debug_payloads["module3_specify"] = {
                **specify_payload,
                "attempt": attempt,
                "validation_feedback_in": feedback_errors,
            }
            try:
                raw_groups = specify_payload.get("ops_spec") or {}
                parsed_groups, validation_warnings = _parse_and_validate_groups(
                    raw_groups=raw_groups,
                    chart_context=chart_context,
                )
                grounded_plan_tree_model = GroundedPlanTree.model_validate(grounded_plan_tree_dict)
                _validate_compiled_groups_match_plan(
                    plan_tree=grounded_plan_tree_model,
                    compiled_groups=parsed_groups,
                )
                break
            except ValueError as exc:
                feedback_errors = [line for line in str(exc).splitlines() if line.strip()]
                specify_retry_notes.append(
                    f"specify attempt {attempt}/{max_specify_attempts} failed with {len(feedback_errors)} validation errors"
                )
                trace_logger.warning(
                    "[request:%s] specify_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_specify_attempts,
                    len(feedback_errors),
                )

                # Cross-module 피드백: 그라운딩 문제이면 Module 2를 1회 재실행
                if (
                    not _cross_module_retry_used
                    and attempt == max_specify_attempts
                    and _is_grounding_error(feedback_errors)
                ):
                    _cross_module_retry_used = True
                    trace_logger.info(
                        "[request:%s] cross_module_retry | grounding error → re-running resolve",
                        request_id,
                    )
                    try:
                        resolve_payload = run_resolve_module(
                            llm=self.llm,
                            prompt_template=self.resolve_prompt,
                            shared_rules=self.shared_rules_prompt,
                            plan_tree=decompose_payload.get("plan_tree") or {},  # type: ignore[arg-type]
                            chart_context=chart_context,
                            rows_preview=rows_preview,
                            validation_feedback=feedback_errors,
                        )
                        resolve_payload.pop("_debug_steps", None)
                        grounded_plan_tree_dict = resolve_payload.get("grounded_plan_tree") or {}
                        debug_payloads["module2_resolve_final"] = {
                            **resolve_payload,
                            "cross_module_retry": True,
                        }
                    except Exception as resolve_exc:
                        trace_logger.warning(
                            "[request:%s] cross_module_retry failed: %s", request_id, str(resolve_exc)
                        )
                    # Specify를 1회 더 시도
                    specify_payload = run_specify_module(
                        llm=self.llm,
                        prompt_template=self.specify_prompt,
                        shared_rules=self.shared_rules_prompt,
                        grounded_plan_tree=grounded_plan_tree_dict,
                        chart_context=chart_context.model_dump(mode="json"),
                        ops_contract=ops_contract,
                        validation_feedback=feedback_errors,
                    )
                    debug_payloads["module3_specify"] = {
                        **specify_payload,
                        "attempt": "cross_module_retry",
                        "validation_feedback_in": feedback_errors,
                    }
                    try:
                        raw_groups = specify_payload.get("ops_spec") or {}
                        parsed_groups, validation_warnings = _parse_and_validate_groups(
                            raw_groups=raw_groups,
                            chart_context=chart_context,
                        )
                        grounded_plan_tree_model = GroundedPlanTree.model_validate(grounded_plan_tree_dict)
                        _validate_compiled_groups_match_plan(
                            plan_tree=grounded_plan_tree_model,
                            compiled_groups=parsed_groups,
                        )
                        break
                    except ValueError:
                        pass  # 아래 exhausted 처리로 fall-through

                if attempt == max_specify_attempts:
                    debug_payloads["error"] = {
                        "stage": "specify_retry_exhausted",
                        "errors": feedback_errors,
                        "attempts": max_specify_attempts,
                        "cross_module_retry_used": _cross_module_retry_used,
                    }
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "specify_opsspec failed after strict retries: "
                        + "; ".join(feedback_errors[:8])
                    ) from exc

        trace_logger.info(
            "[request:%s] specify_opsspec | groups=%d warnings=%d",
            request_id,
            len(specify_payload.get("ops_spec") or {}),
            len(specify_payload.get("warnings") or []),
        )

        # ─────────────────────────────────────────────────────────
        # Canonicalization
        # ─────────────────────────────────────────────────────────
        canonical_groups, canonical_warnings = canonicalize_ops_spec_groups(parsed_groups, chart_context=chart_context)
        trace_logger.info(
            "[request:%s] canonicalized | groups=%d warnings=%d",
            request_id,
            len(canonical_groups),
            len(canonical_warnings),
        )

        # ─────────────────────────────────────────────────────────
        # Draw Plan
        # ─────────────────────────────────────────────────────────
        draw_plan_warnings: List[str] = []
        try:
            draw_ops_spec = build_draw_ops_spec(
                ops_spec=canonical_groups,
                chart_context=chart_context,
                data_rows=data_rows,
                vega_lite_spec=vega_lite_spec,
            )
            draw_plan_path = export_draw_plan_to_public(draw_ops_spec, request_id=request_id)
            debug_payloads["draw_plan"] = {
                "draw_ops_spec": draw_ops_spec,
                "path": str(draw_plan_path),
            }
            trace_logger.info(
                "[request:%s] draw_plan_exported | groups=%d path=%s",
                request_id,
                len(draw_ops_spec),
                str(draw_plan_path),
            )
        except Exception as exc:
            draw_plan_warnings.append(f"draw plan generation failed: {exc}")
            debug_payloads["draw_plan"] = {"error": str(exc)}
            trace_logger.warning("[request:%s] draw_plan_failed | error=%s", request_id, str(exc))

        # ─────────────────────────────────────────────────────────
        # Collect all warnings
        # ─────────────────────────────────────────────────────────
        all_warnings: List[str] = []
        all_warnings.extend(context_warnings)
        all_warnings.extend(decompose_payload.get("warnings") or [])
        all_warnings.extend(decompose_retry_notes)
        all_warnings.extend(resolve_payload.get("warnings") or [])
        all_warnings.extend(resolve_retry_notes)
        all_warnings.extend(specify_payload.get("warnings") or [])
        all_warnings.extend(specify_retry_notes)
        all_warnings.extend(validation_warnings)
        all_warnings.extend(canonical_warnings)
        all_warnings.extend(draw_plan_warnings)

        trace: PipelineTrace | None = None
        if debug:
            trace = PipelineTrace(
                context_built={
                    "chart_context": chart_context.model_dump(mode="json"),
                    "context_warnings": context_warnings,
                    "rows_preview_count": len(rows_preview),
                },
                decompose_plan={
                    **decompose_payload,
                    "goal_type": goal_type,
                    "retry_notes": decompose_retry_notes,
                },
                resolve_plan={
                    **resolve_payload,
                    "retry_notes": resolve_retry_notes,
                },
                specify_opsspec={
                    **specify_payload,
                    "retry_errors": feedback_errors,
                    "retry_notes": specify_retry_notes,
                    "cross_module_retry_used": _cross_module_retry_used,
                },
                canonicalized={
                    "groups": {key: len(value) for key, value in canonical_groups.items()},
                    "warnings": canonical_warnings,
                },
            )

        result = GenerateOpsSpecResponse(
            ops_spec=canonical_groups,
            chart_context=chart_context,
            warnings=all_warnings,
            trace=trace,
        )
        debug_payloads["final_grammar"] = result.model_dump(mode="json", by_alias=True)
        session_dir = _persist_debug_bundle(debug_payloads)
        trace_logger.info("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
        return result

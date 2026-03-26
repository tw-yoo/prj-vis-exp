from contextlib import asynccontextmanager
from datetime import datetime
import logging
import os
import time
from pathlib import Path
import traceback
import uuid
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    CanonicalizeOpsSpecRequest,
    CanonicalizeOpsSpecResponse,
    CompileOpsPlanRequest,
    CompileOpsPlanResponse,
    GenerateAnswerRequest,
    GenerateAnswerResponse,
    GenerateGrammarRequest,
    GenerateLambdaRequest,
    GenerateLambdaResponse,
    RunModuleTraceRequest,
    RunModuleTraceResponse,
    RunPythonPlanRequest,
    RunPythonPlanResponse,
)
from nlp_engine import NLPEngine
from draw_plan import build_draw_ops_spec, export_draw_plan_to_public, validate_draw_groups_payload
from opsspec.runtime.scheduler import schedule_ops_spec
from opsspec.runtime.execution_plan import build_sentence_execution_plan
from opsspec.runtime.visual_execution_plan import build_visual_execution_plan
from opsspec.modules.pipeline import OpsSpecPipeline
from opsspec.modules.answer_pipeline import (
    ChartAnswerPipeline,
    _load_csv_file,
    _load_json_file,
    _project_root,
    _resolve_path_under_root,
)
from opsspec.runtime.python_scenario_loader import PythonScenarioLoadError, load_python_scenario_request
from opsspec.runtime.ui_schema import build_op_registry_ui_schema
from opsspec.runtime.context_builder import build_chart_context
from opsspec.runtime.canonicalize import canonicalize_ops_spec_groups
from opsspec.validation.endpoint_validators import validate_and_parse_ops_spec_groups, validate_refs_against_node_ids
from opsspec.core.utils import prune_nulls

logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("pipeline_trace")


def _error_reports_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "expert_prompt_reports"


def _safe_line(value: str, *, max_len: int = 500) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= max_len:
        return normalized
    return normalized[: max_len - 3] + "..."


def _extract_encoding_fields(spec: Dict[str, Any]) -> List[str]:
    encoding = spec.get("encoding")
    if not isinstance(encoding, dict):
        return []
    fields: List[str] = []
    for channel_spec in encoding.values():
        if not isinstance(channel_spec, dict):
            continue
        field = channel_spec.get("field")
        if isinstance(field, str) and field and field not in fields:
            fields.append(field)
    return fields


def _write_error_report(
    *,
    endpoint: str,
    request_id: str,
    elapsed_ms: float,
    error: Exception,
    request_summary: Dict[str, Any],
) -> Path | None:
    try:
        out_dir = _error_reports_dir()
        out_dir.mkdir(parents=True, exist_ok=True)

        now = datetime.now()
        stamp = now.strftime("%Y%m%d_%H%M%S")
        file_name = f"{endpoint.strip('/').replace('/', '_')}_error_{stamp}_{request_id}.txt"
        path = out_dir / file_name

        lines: List[str] = [
            "# NLP Server Error Report",
            f"generated_at: {now.strftime('%Y-%m-%d %H:%M:%S %z')}",
            f"endpoint: {endpoint}",
            f"request_id: {request_id}",
            f"elapsed_ms: {elapsed_ms:.1f}",
            f"error_type: {type(error).__name__}",
            f"error_message: {_safe_line(str(error), max_len=1000)}",
            "",
            "## Request Summary",
        ]

        for key, value in request_summary.items():
            if isinstance(value, str):
                lines.append(f"{key}: {_safe_line(value, max_len=1000)}")
            else:
                lines.append(f"{key}: {value}")

        lines.extend(
            [
                "",
                "## Traceback",
                traceback.format_exc().rstrip(),
                "",
            ]
        )
        path.write_text("\n".join(lines), encoding="utf-8")
        return path
    except Exception:
        logger.exception(
            "Failed to write error report | endpoint=%s request_id=%s",
            endpoint,
            request_id,
        )
        return None


def configure_trace_logger(log_path: str) -> None:
    path = Path(log_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)

    for handler in list(trace_logger.handlers):
        trace_logger.removeHandler(handler)
        handler.close()

    file_handler = logging.FileHandler(path, mode="w", encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    trace_logger.addHandler(file_handler)
    trace_logger.setLevel(logging.INFO)
    trace_logger.propagate = False

    trace_logger.info("==== pipeline trace log initialized ====")


@asynccontextmanager
async def lifespan(app: FastAPI):
    ollama_model = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:1.5b")
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    ollama_api_key = os.getenv("OLLAMA_API_KEY", "ollama")
    use_gpu = os.getenv("STANZA_USE_GPU", "false").lower() == "true"
    trace_log_path = os.getenv("TRACE_LOG_PATH", "logs/pipeline_trace.log")

    configure_trace_logger(trace_log_path)
    trace_logger.info(
        "startup config | model=%s base_url=%s use_gpu=%s",
        ollama_model,
        ollama_base_url,
        use_gpu,
    )

    engine = NLPEngine(
        language="en",
        use_gpu=use_gpu,
        ollama_model=ollama_model,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
    )
    grammar_pipeline = OpsSpecPipeline(
        ollama_model=ollama_model,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
        prompts_dir=Path(__file__).parent / "prompts",
    )
    answer_pipeline = ChartAnswerPipeline(
        ollama_model=ollama_model,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
        prompts_dir=Path(__file__).parent / "prompts",
    )

    try:
        engine.load()
        grammar_pipeline.load()
        answer_pipeline.load()
    except Exception:
        logger.exception("Failed to initialize NLP models during startup.")
        raise

    app.state.nlp_engine = engine
    app.state.grammar_pipeline = grammar_pipeline
    app.state.answer_pipeline = answer_pipeline
    yield


app = FastAPI(
    title="Neuro-Symbolic Semantic Parser",
    version="1.0.0",
    lifespan=lifespan,
)

default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/op_registry")
async def op_registry():
    # UI-facing schema for specTest: op-specific parameter contract + ref rules.
    return prune_nulls(build_op_registry_ui_schema())


@app.post("/canonicalize_opsspec", response_model=CanonicalizeOpsSpecResponse)
async def canonicalize_opsspec(request: CanonicalizeOpsSpecRequest):
    request_id = uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    q_preview = " ".join(request.question.split())[:120]
    logger.info('[/canonicalize_opsspec] request received | request_id=%s question="%s"', request_id, q_preview)

    trace_logger.info(
        "[request:%s] canonicalize_in | rows=%d groups=%d",
        request_id,
        len(request.data_rows),
        len(request.ops_spec or {}),
    )

    try:
        chart_context, ctx_warnings, _rows_preview = build_chart_context(
            request.vega_lite_spec,
            request.data_rows,
        )

        raw_groups = request.ops_spec or {}
        if not isinstance(raw_groups, dict):
            raise ValueError('ops_spec must be an object like {"ops":[...],"ops2":[...]}')

        groups, parse_warnings, errors = validate_and_parse_ops_spec_groups(raw_groups, chart_context)
        warnings: List[str] = list(ctx_warnings) + parse_warnings

        # "ops" 그룹이 없으면 빈 값으로 보장 (안정적인 UI 흐름)
        groups.setdefault("ops", [])

        # ref/inputs 가 실존하는 nodeId를 가리키는지 교차 검증
        errors.extend(validate_refs_against_node_ids(groups))

        if errors:
            raise ValueError("Validation failed:\n- " + "\n- ".join(errors))

        canonical_groups, canon_warnings = canonicalize_ops_spec_groups(groups, chart_context=chart_context)
        warnings.extend(canon_warnings)

        ops_dump = {
            group_name: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
            for group_name, ops in canonical_groups.items()
        }
        response = CanonicalizeOpsSpecResponse(
            ops_spec=prune_nulls(ops_dump),
            warnings=warnings,
            chart_context=chart_context,
        )

        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[/canonicalize_opsspec] request completed | request_id=%s groups=%d warnings=%d elapsed_ms=%.1f",
            request_id,
            len(ops_dump),
            len(warnings),
            elapsed_ms,
        )
        trace_logger.info("[request:%s] canonicalize_out | elapsed_ms=%.1f", request_id, elapsed_ms)
        return prune_nulls(response.model_dump())
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/canonicalize_opsspec] error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/canonicalize_opsspec",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "question_preview": q_preview,
                "explanation_preview": _safe_line(request.explanation, max_len=500),
                "data_rows_count": len(request.data_rows),
                "ops_groups_count": len(request.ops_spec or {}),
            },
        )
        if report_path is not None:
            logger.error(
                "[/canonicalize_opsspec] error report saved | request_id=%s path=%s",
                request_id,
                report_path,
            )
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/generate_lambda", response_model=GenerateLambdaResponse)
async def generate_lambda(request: GenerateLambdaRequest):
    engine: NLPEngine = getattr(app.state, "nlp_engine", None)
    if engine is None:
        raise HTTPException(status_code=500, detail="NLP engine is not initialized.")

    request_id = uuid.uuid4().hex[:12]
    text_preview = " ".join(request.text.split())[:120]
    started_at = time.perf_counter()
    logger.info('[/generate_lambda] request received | request_id=%s text="%s"', request_id, text_preview)
    trace_logger.info(
        "[request:%s] endpoint_in | text=%s chart_fields=%d dimension_fields=%d measure_fields=%d",
        request_id,
        request.text,
        len(request.chart_context.fields),
        len(request.chart_context.dimension_fields),
        len(request.chart_context.measure_fields),
    )

    try:
        result = engine.generate_lambda(
            text=request.text,
            chart_context=request.chart_context.model_dump(),
            request_id=request_id,
        )
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[/generate_lambda] request completed | request_id=%s lambda_steps=%d ops_groups=%d warnings=%d elapsed_ms=%.1f",
            request_id,
            len(result.get("lambda_expression", [])),
            len(result.get("ops_spec", {})),
            len(result.get("warnings", [])),
            elapsed_ms,
        )
        trace_logger.info("[request:%s] endpoint_out | elapsed_ms=%.1f", request_id, elapsed_ms)
        return GenerateLambdaResponse(**result)
    except RuntimeError as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/generate_lambda] runtime error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/generate_lambda",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "text_preview": text_preview,
                "chart_fields_count": len(request.chart_context.fields),
                "dimension_fields_count": len(request.chart_context.dimension_fields),
                "measure_fields_count": len(request.chart_context.measure_fields),
            },
        )
        if report_path is not None:
            logger.error("[/generate_lambda] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] runtime_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/generate_lambda] unhandled error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/generate_lambda",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "text_preview": text_preview,
                "chart_fields_count": len(request.chart_context.fields),
                "dimension_fields_count": len(request.chart_context.dimension_fields),
                "measure_fields_count": len(request.chart_context.measure_fields),
            },
        )
        if report_path is not None:
            logger.error("[/generate_lambda] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] unhandled_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        logger.exception("Failed to generate lambda expression.")
        raise HTTPException(status_code=500, detail=f"Failed to parse text: {exc}") from exc


@app.post("/generate_grammar")
async def generate_grammar(request: GenerateGrammarRequest):
    pipeline: OpsSpecPipeline = getattr(app.state, "grammar_pipeline", None)
    if pipeline is None:
        raise HTTPException(status_code=500, detail="Grammar pipeline is not initialized.")

    request_id = uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    q_preview = " ".join(request.question.split())[:120]
    logger.info('[/generate_grammar] request received | request_id=%s question="%s"', request_id, q_preview)

    trace_logger.info(
        "[request:%s] grammar_endpoint_in | rows=%d debug=%s",
        request_id,
        len(request.data_rows),
        bool(request.debug),
    )

    try:
        result = pipeline.generate(
            question=request.question,
            explanation=request.explanation,
            vega_lite_spec=request.vega_lite_spec,
            data_rows=request.data_rows,
            request_id=request_id,
            debug=bool(request.debug),
        )
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[/generate_grammar] request completed | request_id=%s groups=%d warnings=%d elapsed_ms=%.1f",
            request_id,
            len(result.ops_spec),
            len(result.warnings),
            elapsed_ms,
        )
        trace_logger.info("[request:%s] grammar_endpoint_out | elapsed_ms=%.1f", request_id, elapsed_ms)
        # Return both logical ops groups and executable draw_plan for the web client.
        groups_dump = {
            group_name: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
            for group_name, ops in result.ops_spec.items()
        }
        draw_plan_dump = validate_draw_groups_payload(
            build_draw_ops_spec(
                ops_spec=result.ops_spec,
                chart_context=result.chart_context,
                data_rows=request.data_rows,
                vega_lite_spec=request.vega_lite_spec,
            )
        )
        execution_plan_dump = build_sentence_execution_plan(
            ops_spec=result.ops_spec,
            draw_plan_groups=draw_plan_dump,
        )
        visual_execution_plan_dump = build_visual_execution_plan(ops_spec=result.ops_spec)

        response_payload: Dict[str, Any] = dict(groups_dump)
        response_payload["draw_plan"] = draw_plan_dump
        response_payload["execution_plan"] = execution_plan_dump
        response_payload["visual_execution_plan"] = visual_execution_plan_dump
        return prune_nulls(response_payload)
    except RuntimeError as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/generate_grammar] runtime error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/generate_grammar",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "question_preview": q_preview,
                "explanation_preview": _safe_line(request.explanation, max_len=500),
                "data_rows_count": len(request.data_rows),
                "vega_mark": request.vega_lite_spec.get("mark"),
                "vega_encoding_fields": _extract_encoding_fields(request.vega_lite_spec),
                "debug": bool(request.debug),
            },
        )
        if report_path is not None:
            logger.error("[/generate_grammar] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] grammar_runtime_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/generate_grammar] unhandled error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/generate_grammar",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "question_preview": q_preview,
                "explanation_preview": _safe_line(request.explanation, max_len=500),
                "data_rows_count": len(request.data_rows),
                "vega_mark": request.vega_lite_spec.get("mark"),
                "vega_encoding_fields": _extract_encoding_fields(request.vega_lite_spec),
                "debug": bool(request.debug),
            },
        )
        if report_path is not None:
            logger.error("[/generate_grammar] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] grammar_unhandled_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        logger.exception("Failed to generate grammar.")
        raise HTTPException(status_code=500, detail=f"Failed to parse text: {exc}") from exc


@app.post("/compile_ops_plan", response_model=CompileOpsPlanResponse)
async def compile_ops_plan(request: CompileOpsPlanRequest):
    request_id = uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    logger.info(
        "[/compile_ops_plan] request received | request_id=%s groups=%d rows=%d",
        request_id,
        len(request.ops_spec or {}),
        len(request.data_rows),
    )

    try:
        chart_context, ctx_warnings, _ = build_chart_context(request.vega_lite_spec, request.data_rows)
        raw_groups = request.ops_spec or {}
        if not isinstance(raw_groups, dict):
            raise ValueError('ops_spec must be an object like {"ops":[...],"ops2":[...]}')

        groups, parse_warnings, parse_errors = validate_and_parse_ops_spec_groups(raw_groups, chart_context)
        groups.setdefault("ops", [])
        parse_errors.extend(validate_refs_against_node_ids(groups))
        if parse_errors:
            raise ValueError("Validation failed:\n- " + "\n- ".join(parse_errors))

        canonical_groups, canonical_warnings = canonicalize_ops_spec_groups(groups, chart_context=chart_context)
        scheduled_groups = schedule_ops_spec(canonical_groups)

        draw_plan_dump = validate_draw_groups_payload(
            build_draw_ops_spec(
                ops_spec=scheduled_groups,
                chart_context=chart_context,
                data_rows=request.data_rows,
                vega_lite_spec=request.vega_lite_spec,
            )
        )
        execution_plan_dump = build_sentence_execution_plan(
            ops_spec=scheduled_groups,
            draw_plan_groups=draw_plan_dump,
        )
        visual_execution_plan_dump = build_visual_execution_plan(ops_spec=scheduled_groups)
        ops_dump = {
            group_name: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
            for group_name, ops in scheduled_groups.items()
        }
        warnings = list(ctx_warnings) + list(parse_warnings) + list(canonical_warnings)

        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[/compile_ops_plan] request completed | request_id=%s groups=%d draw_groups=%d steps=%d warnings=%d elapsed_ms=%.1f",
            request_id,
            len(ops_dump),
            len(draw_plan_dump),
            len(execution_plan_dump.get("steps") or []),
            len(warnings),
            elapsed_ms,
        )

        payload = CompileOpsPlanResponse(
            ops_spec=ops_dump,
            draw_plan=draw_plan_dump,
            execution_plan=execution_plan_dump,
            visual_execution_plan=visual_execution_plan_dump,
            warnings=warnings,
        )
        return prune_nulls(payload.model_dump())
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/compile_ops_plan] error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/compile_ops_plan",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "ops_groups_count": len(request.ops_spec or {}),
                "data_rows_count": len(request.data_rows),
                "vega_mark": request.vega_lite_spec.get("mark"),
                "vega_encoding_fields": _extract_encoding_fields(request.vega_lite_spec),
            },
        )
        if report_path is not None:
            logger.error("[/compile_ops_plan] error report saved | request_id=%s path=%s", request_id, report_path)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/answer_question", response_model=GenerateAnswerResponse)
async def answer_question(request: GenerateAnswerRequest):
    pipeline: ChartAnswerPipeline = getattr(app.state, "answer_pipeline", None)
    if pipeline is None:
        raise HTTPException(status_code=500, detail="Answer pipeline is not initialized.")

    request_id = uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    q_preview = " ".join(request.question.split())[:120]
    logger.info('[/answer_question] request received | request_id=%s question="%s"', request_id, q_preview)

    trace_logger.info(
        "[request:%s] answer_endpoint_in | spec_path=%s csv_path=%s debug=%s",
        request_id,
        request.vega_lite_spec_path,
        request.data_csv_path,
        bool(request.debug),
    )

    try:
        payload = pipeline.answer_from_paths(
            question=request.question,
            vega_lite_spec_path=request.vega_lite_spec_path,
            data_csv_path=request.data_csv_path,
            llm_choice=request.llm,
            request_id=request_id,
            debug=bool(request.debug),
        )
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[/answer_question] request completed | request_id=%s warnings=%d elapsed_ms=%.1f",
            request_id,
            len(payload.get("warnings") or []),
            elapsed_ms,
        )
        trace_logger.info("[request:%s] answer_endpoint_out | elapsed_ms=%.1f", request_id, elapsed_ms)

        return {
            "plan": payload.get("plan") or [],
            "answer": payload.get("answer") or "",
            "explanation": payload.get("explanation") or "",
            "warnings": payload.get("warnings") or [],
            "request_id": request_id,
        }
    except RuntimeError as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/answer_question] runtime error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/answer_question",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "question_preview": q_preview,
                "vega_lite_spec_path": request.vega_lite_spec_path,
                "data_csv_path": request.data_csv_path,
                "llm": request.llm,
                "debug": bool(request.debug),
            },
        )
        if report_path is not None:
            logger.error("[/answer_question] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] answer_runtime_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/answer_question] unhandled error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/answer_question",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "question_preview": q_preview,
                "vega_lite_spec_path": request.vega_lite_spec_path,
                "data_csv_path": request.data_csv_path,
                "llm": request.llm,
                "debug": bool(request.debug),
            },
        )
        if report_path is not None:
            logger.error("[/answer_question] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] answer_unhandled_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {exc}") from exc


@app.post("/run_module_trace", response_model=RunModuleTraceResponse)
async def run_module_trace(request: RunModuleTraceRequest):
    pipeline: OpsSpecPipeline = getattr(app.state, "grammar_pipeline", None)
    if pipeline is None:
        raise HTTPException(status_code=500, detail="Grammar pipeline is not initialized.")

    try:
        root = _project_root().resolve()
        spec_path = _resolve_path_under_root(request.vega_lite_spec_path, root=root)
        data_path = _resolve_path_under_root(request.data_csv_path, root=root)
        spec = _load_json_file(spec_path)
        _, rows = _load_csv_file(data_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    request_id = uuid.uuid4().hex[:12]
    result = pipeline.generate(
        question=request.question,
        explanation=request.explanation,
        vega_lite_spec=spec,
        data_rows=rows,
        request_id=request_id,
        debug=True,
    )

    trace = result.trace.model_dump(mode="json") if result.trace else {}
    inventory = trace.get("inventory", {}) if isinstance(trace, dict) else {}
    steps = trace.get("steps", []) if isinstance(trace, dict) else []
    ops_spec = {
        group: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
        for group, ops in result.ops_spec.items()
    }
    return {
        "inventory": inventory,
        "steps": steps,
        "ops_spec": ops_spec,
        "trace": trace,
        "chart_context": result.chart_context.model_dump(mode="json"),
    }


@app.post("/run_python_plan", response_model=RunPythonPlanResponse)
async def run_python_plan(request: RunPythonPlanRequest):
    pipeline: OpsSpecPipeline = getattr(app.state, "grammar_pipeline", None)
    if pipeline is None:
        raise HTTPException(status_code=500, detail="Grammar pipeline is not initialized.")

    request_id = uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    scenario_preview = _safe_line(request.scenario_path, max_len=180)
    logger.info('[/run_python_plan] request received | request_id=%s scenario="%s"', request_id, scenario_preview)

    trace_logger.info(
        "[request:%s] python_plan_endpoint_in | scenario_path=%s debug=%s",
        request_id,
        request.scenario_path,
        bool(request.debug),
    )

    try:
        scenario_request, normalized_path = load_python_scenario_request(request.scenario_path)
        debug_flag = bool(request.debug or scenario_request.debug)

        grammar_result = pipeline.generate(
            question=scenario_request.question,
            explanation=scenario_request.explanation,
            vega_lite_spec=scenario_request.vega_lite_spec,
            data_rows=scenario_request.data_rows,
            request_id=request_id,
            debug=debug_flag,
        )

        draw_plan = build_draw_ops_spec(
            ops_spec=grammar_result.ops_spec,
            chart_context=grammar_result.chart_context,
            data_rows=scenario_request.data_rows,
            vega_lite_spec=scenario_request.vega_lite_spec,
        )
        draw_plan_path = export_draw_plan_to_public(draw_plan, request_id=request_id)

        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "[/run_python_plan] request completed | request_id=%s scenario=%s groups=%d draw_groups=%d elapsed_ms=%.1f",
            request_id,
            normalized_path,
            len(grammar_result.ops_spec),
            len(draw_plan),
            elapsed_ms,
        )
        trace_logger.info(
            "[request:%s] python_plan_endpoint_out | elapsed_ms=%.1f draw_plan_path=%s",
            request_id,
            elapsed_ms,
            str(draw_plan_path),
        )
        response_payload = RunPythonPlanResponse(
            scenario_path=normalized_path,
            vega_lite_spec=scenario_request.vega_lite_spec,
            draw_plan=draw_plan,
            warnings=list(grammar_result.warnings),
        )
        return prune_nulls(response_payload.model_dump())
    except PythonScenarioLoadError as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/run_python_plan] scenario load error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/run_python_plan",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "scenario_path": request.scenario_path,
                "debug": bool(request.debug),
                "failure_stage": "scenario_load",
            },
        )
        if report_path is not None:
            logger.error("[/run_python_plan] error report saved | request_id=%s path=%s", request_id, report_path)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/run_python_plan] runtime error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/run_python_plan",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "scenario_path": request.scenario_path,
                "debug": bool(request.debug),
            },
        )
        if report_path is not None:
            logger.error("[/run_python_plan] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] python_plan_runtime_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "[/run_python_plan] unhandled error | request_id=%s elapsed_ms=%.1f error=%s",
            request_id,
            elapsed_ms,
            exc,
        )
        report_path = _write_error_report(
            endpoint="/run_python_plan",
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            error=exc,
            request_summary={
                "scenario_path": request.scenario_path,
                "debug": bool(request.debug),
            },
        )
        if report_path is not None:
            logger.error("[/run_python_plan] error report saved | request_id=%s path=%s", request_id, report_path)
        trace_logger.error("[request:%s] python_plan_unhandled_error | elapsed_ms=%.1f error=%s", request_id, elapsed_ms, exc)
        raise HTTPException(status_code=500, detail=f"Failed to run python plan: {exc}") from exc


if __name__ == "__main__":
    try:
        import uvicorn  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "uvicorn is required to run the server via `python main.py`. "
            "Install uvicorn or run via your existing server runner."
        ) from exc

    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)

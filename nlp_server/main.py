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
    GenerateGrammarRequest,
    GenerateLambdaRequest,
    GenerateLambdaResponse,
)
from nlp_engine import NLPEngine
from opsspec.pipeline import OpsSpecPipeline

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

    try:
        engine.load()
        grammar_pipeline.load()
    except Exception:
        logger.exception("Failed to initialize NLP models during startup.")
        raise

    app.state.nlp_engine = engine
    app.state.grammar_pipeline = grammar_pipeline
    yield


app = FastAPI(
    title="Neuro-Symbolic Semantic Parser",
    version="1.0.0",
    lifespan=lifespan,
)

default_origins = "http://localhost:5173,http://127.0.0.1:5173"
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


def _prune_nulls(value):  # type: ignore[no-untyped-def]
    # Keep API responses minimal: drop null keys/items recursively.
    if value is None:
        return None
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if v is None:
                continue
            pv = _prune_nulls(v)
            if pv is None:
                continue
            out[k] = pv
        return out
    if isinstance(value, list):
        out_list = []
        for item in value:
            if item is None:
                continue
            pv = _prune_nulls(item)
            if pv is None:
                continue
            out_list.append(pv)
        return out_list
    return value


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

    # Never log raw rows; only counts and context summary.
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
        # Keep response minimal for the web client: only return opsSpec groups under a single key.
        groups_dump = {
            group_name: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
            for group_name, ops in result.ops_spec.items()
        }
        return _prune_nulls({"ops1": groups_dump})
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


if __name__ == "__main__":
    try:
        import uvicorn  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "uvicorn is required to run the server via `python main.py`. "
            "Install uvicorn or run via your existing server runner."
        ) from exc

    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)

"""test_grammar.py 정답 spec과 /generate_grammar 출력 비교 테스트."""
from __future__ import annotations

import importlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from opsspec.tests.comparators import (
    SpecCompareResult,
    compare_spec_groups,
    load_chartqa_case,
    load_test_inputs,
    serialize_spec_dict,
)

# ────────────────────────────────────────────────────────────────────────────
# LLM 설정 (코드로 직접 지정)
# ────────────────────────────────────────────────────────────────────────────

LLM_BACKEND = "openai"  # "openai" | "ollama"
OLLAMA_MODEL = "llama3.1:8b"
OPENAI_MODEL = "gpt-5.4-nano" #"gpt-5.2"
OLLAMA_BASE_URL = "http://localhost:11434/v1"
OLLAMA_API_KEY = "ollama"

os.environ["LLM_BACKEND"] = LLM_BACKEND
os.environ["OLLAMA_MODEL"] = OLLAMA_MODEL
os.environ["OPENAI_MODEL"] = OPENAI_MODEL

# ────────────────────────────────────────────────────────────────────────────
# JSON 결과 파일 설정 (코드로 직접 지정)
# ────────────────────────────────────────────────────────────────────────────

EVAL_RESULTS_JSON = Path(__file__).parent / "eval_results.json"

# ────────────────────────────────────────────────────────────────────────────
# JSON 헬퍼
# ────────────────────────────────────────────────────────────────────────────


def _load_done_keys() -> set[tuple[str, str, str, str]]:
    """JSON에서 이미 실행된 (spec_id, backend, model, gt_spec_canonical) 조합 로드."""
    if not EVAL_RESULTS_JSON.exists():
        return set()
    records: list[dict] = json.loads(EVAL_RESULTS_JSON.read_text(encoding="utf-8"))
    return {
        (r["spec_id"], r["backend"], r["model"], json.dumps(r["gt_spec"], sort_keys=True))
        for r in records
    }


def _append_record(record: dict) -> None:
    """결과를 JSON 배열에 추가 (파일 없으면 새로 생성)."""
    records: list[dict] = []
    if EVAL_RESULTS_JSON.exists():
        records = json.loads(EVAL_RESULTS_JSON.read_text(encoding="utf-8"))
    records.append(record)
    EVAL_RESULTS_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def _get_model_name(pipeline: Any) -> str:
    """backend에 따라 실제 모델명 반환."""
    if pipeline.llm.backend == "openai_http":
        return os.getenv("OPENAI_MODEL", "unknown")
    return pipeline.llm.ollama_model or "unknown"


# ────────────────────────────────────────────────────────────────────────────
# 입력 데이터 로드 (test_inputs.csv)
# ────────────────────────────────────────────────────────────────────────────

# {chart_id: {"chart_id": ..., "question": ..., "explanation": ...}}
INPUTS_BY_ID: dict[str, dict] = {
    row["chart_id"]: row
    for row in load_test_inputs()
}

def _load_test_grammar_module():
    from opsspec.tests import taewon_test

    return importlib.reload(taewon_test)


def _collect_all_specs() -> dict[str, dict]:
    test_grammar = _load_test_grammar_module()
    return {
        name: val
        for name, val in vars(test_grammar).items()
        if name.startswith("spec_") and isinstance(val, dict)
    }


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if {"spec_name", "spec_dict"}.issubset(set(metafunc.fixturenames)):
        metafunc.parametrize("spec_name,spec_dict", list(_collect_all_specs().items()))

# ────────────────────────────────────────────────────────────────────────────
# API 출력 vs 정답 비교 테스트 (ground truth 검증)
# ────────────────────────────────────────────────────────────────────────────


def test_grammar_matches_ground_truth(spec_name: str, spec_dict: dict) -> None:
    """pipeline 출력이 ground truth spec과 일치하는지 검증한다.

    test_inputs.csv에 chart_id가 없으면 skip.
    ChartQA 파일이 없으면 skip.
    이미 동일한 (spec_id, backend, model, gt_spec) 조합이 eval_results.json에 있으면 skip.
    """
    chart_id = spec_name.removeprefix("spec_")

    # test_inputs.csv에서 question/explanation 조회
    if chart_id not in INPUTS_BY_ID:
        pytest.skip(f"test_inputs.csv에 chart_id={chart_id} 없음 {spec_name}")
    inp = INPUTS_BY_ID[chart_id]

    # ChartQA에서 vega-lite spec + data rows 로드
    try:
        vega_lite_spec, data_rows = load_chartqa_case(chart_id)
    except FileNotFoundError as e:
        pytest.skip(str(e))

    # pipeline 초기화 (LLM 호출 없음 — backend/model 정보만 추출)
    from opsspec.modules.pipeline import OpsSpecPipeline, _build_human_abstracted_ops_spec

    pipeline = OpsSpecPipeline(
        ollama_model=OLLAMA_MODEL,
        ollama_base_url=OLLAMA_BASE_URL,
        ollama_api_key=OLLAMA_API_KEY,
        prompts_dir=Path(__file__).parent.parent.parent / "prompts",
    )
    backend = pipeline.llm.backend or "unknown"
    model = _get_model_name(pipeline)

    # ground truth 직렬화
    gt_serialized = serialize_spec_dict(spec_dict)

    # 중복 체크 — 이미 실행된 조합이면 skip
    gt_spec_canonical = json.dumps(gt_serialized, sort_keys=True)
    done_keys = _load_done_keys()
    if (spec_name, backend, model, gt_spec_canonical) in done_keys:
        pytest.skip(f"이미 실행된 조합: spec_id={spec_name}, backend={backend}, model={model}")

    pred_groups_human: dict[str, Any] = {}
    cmp: SpecCompareResult | None = None
    failure_reason = ""
    caught_exc: Exception | None = None

    try:
        # pipeline 실행
        result = pipeline.generate(
            question=inp["question"],
            explanation=inp["explanation"],
            vega_lite_spec=vega_lite_spec,
            data_rows=data_rows,
            request_id=f"test_{chart_id}_{uuid.uuid4().hex[:8]}",
            debug=True,
        )

        # pipeline 출력 직렬화 (ops 그룹만, draw_plan 등 제외)
        pred_groups_raw: dict[str, Any] = {
            group_key: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
            for group_key, ops in result.ops_spec.items()
        }
        pred_groups_human = _build_human_abstracted_ops_spec(pred_groups_raw)
        cmp = compare_spec_groups(gt_serialized, pred_groups_human)
        if not cmp.all_match:
            failure_reason = cmp.report()

    except Exception as exc:
        caught_exc = exc
        failure_reason = f"{type(exc).__name__}: {exc}"

    finally:
        _append_record({
            "spec_id":        spec_name,
            "backend":        backend,
            "model":          model,
            "chart_id":       chart_id,
            "success":        bool(cmp.all_match) if cmp is not None else False,
            "question":       inp["question"],
            "explanation":    inp["explanation"],
            "gt_spec":        gt_serialized,
            "pred_output":    pred_groups_human if pred_groups_human else {},
            "failure_reason": failure_reason,
            "timestamp":      datetime.now(timezone.utc).isoformat(),
        })

    if caught_exc is not None:
        raise caught_exc

    assert cmp is not None and cmp.all_match, (
        f"[{spec_name}] grammar 불일치:\n{cmp.report() if cmp is not None else failure_reason}"
    )

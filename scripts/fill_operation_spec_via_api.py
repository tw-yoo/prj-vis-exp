#!/usr/bin/env python3
"""
tech_eval_*_ours.csv 의 비어있는 operation_spec 을 generate_grammar API 로 채우는 스크립트.

목적
----
chatgpt / gemini 가 손으로 채운 spec 대신, 우리 시스템이 실제로 같은
(question, explanation, chart) 에서 어떤 operation_spec 을 만드는지 확인한다.

두 가지 생성 방식(MODE)을 지원한다:
  - "ours"     : /generate_grammar           (제안 DAG 시스템; Inventory + step-compose 멀티콜)
  - "baseline" : /generate_grammar_baseline  (B2 plan-then-execute; 1회 LLM 계획 → 결정론 schedule+execute)

입력 = explanation (+question), 출력 = operation_spec. 즉 이 스크립트는 explanation→spec 변환을 평가한다.

설명(explanation) 소스는 chatgpt / gemini / human 세 가지이며, 셋 다 서로 다르다(의도된 것).
평가 목적: "같은 질문에 대한 3가지 설명" 각각에 대해, 우리 시스템이 얼마나 잘 operation_spec 을 만드는지 본다.
  - TARGET = 입력 설명 소스(chatgpt|gemini|human). 소스마다 별도 입력/출력 CSV 를 쓴다.
  - BACKEND = 시스템 *내부* LLM 백엔드. 기본값 "openai"(chatgpt). "ollama" 도 지원.
    평가 논문 기준으로는 항상 chatgpt(openai) 를 써야 하지만, 로컬 테스트/디버그 시 ollama 로 전환 가능.

동작
----
1. MODE("ours"|"baseline") + TARGET("chatgpt"|"gemini"|"human") 로 입출력 CSV 결정.
     ours     -> review_cases_<target>_ours.csv
     baseline -> review_cases_<target>_baseline.csv
2. CHART_IDS 리스트(코드 안에 하드코딩)에 있는 row 만 대상으로,
   operation_spec 이 비어있으면 API 를 호출해서 결과를 그 자리에 채운다.
   (이미 채워져 있으면 skip. OVERWRITE=True 면 무시하고 다시 채움.)
3. 매 row 마다 CSV 를 원자적으로 저장(incremental save) → 중간에 죽어도 진행분 보존.
4. chart_id 별 결과/경고/에러/소요시간을 sidecar JSONL 로그에 남김.

API 흐름
--------
chart_id -> POST /generate_grammar_request_body (서버가 ChartQA spec+csv 로딩; llm_backend=openai 고정)
         -> POST <mode endpoint> (ours=recursive / baseline=plan-then-execute; 내부 LLM=chatgpt)
         -> {ops, ops2, ...} 응답

requests 의존성 없이 표준 라이브러리(urllib)만 사용.

사용 예
-------
  python scripts/fill_operation_spec_via_api.py --target chatgpt                         # ours, chatgpt 설명, openai 백엔드
  python scripts/fill_operation_spec_via_api.py --target gemini  --mode baseline
  python scripts/fill_operation_spec_via_api.py --target human   --mode ours
  python scripts/fill_operation_spec_via_api.py --target chatgpt --all                   # CHART_IDS 무시, 빈 row 전부
  python scripts/fill_operation_spec_via_api.py --target chatgpt --overwrite             # 이미 찬 것도 다시
  python scripts/fill_operation_spec_via_api.py --target chatgpt --dry-run               # 호출 대상만 출력
  python scripts/fill_operation_spec_via_api.py --target chatgpt --backend ollama        # 로컬 ollama 로 테스트
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ──────────────────────────────────────────────────────────────────────────
# CONFIG  (필요에 맞게 수정)
# ──────────────────────────────────────────────────────────────────────────

# 생성 방식: "ours"(제안 DAG) 또는 "baseline"(single-shot)
MODE = "ours"

# 입력 설명 소스(= 입출력 파일 prefix): "chatgpt" | "gemini" | "human".
# 셋은 서로 다른 explanation 을 담고 있고, 각 소스에 대해 시스템이 만든 spec 을 평가한다.
TARGET = "chatgpt"

# 시스템 내부 LLM 백엔드: "openai"(chatgpt, 기본값) | "ollama"(로컬 테스트용).
# 논문 평가에는 항상 "openai" 를 쓸 것.
LLM_BACKEND = "openai"

# OpenAI 모델명. None 이면 서버의 OPENAI_MODEL 환경변수 또는 서버 기본값(gpt-5.4-mini)을 사용.
OPENAI_MODEL: str | None = "gpt-5.4"

# Ollama 모델명. backend=ollama 일 때만 사용. None 이면 서버 기본값(main.py 의 OLLAMA_MODEL).
OLLAMA_MODEL: str | None = None

# 처리할 chart_id 목록 (여기에 직접 넣으세요).
# 비워두고 --all 을 주면, operation_spec 이 비어있는 모든 row 를 대상으로 합니다.
#
# 아래 25개는 타입별 5개씩, 흔한 op(희소 op = monotonicRun/rollingWindow/diffByValue/range 제외)와
# 다양한 연산 순서를 커버하도록 human_explanation_ours.csv(gold) 기준으로 선정한 1차 테스트 셋.
CHART_IDS: List[str] = [
    # simpleBar  (findExtremum/add/scale/compareBool, filter→sum→retrieveValue→diff, sort→nth→add, lagDiff→filter→count 등)
    "0k7bm9iqewnrzj47",
    "0ijwrg723j4v8s3e",
    "0cad2xfrwdgvo9zk",
    "1hlsoeyqlr1r1n41",
    "1lf1h5jf9ymeid5q",
    # groupedBar  (pairDiff 포함, 다단계 filter/diff/add/compareBool, filter→sort→nth→retrieveValue 등)
    "1x37jzohqd666qc0",
    "0bgcjlbz7nv5vnjc",
    "0ihx2vzdsej883sq",
    "221xoyhy3yziwabm",
    "0lua5jsw92d3enb4",
    # stackedBar  (retrieveValue/add/diff, pairDiff→filter→count, filter→lagDiff→findExtremum, sum→retrieveValue→compareBool 등)
    "c3mncg8r4g6bjoon",
    "0vfqjaxeiv96ww7g",
    "0gzowodb2py0d1s9",
    "9g5a38vcep03acdu",
    "1xz4egh52kvh2xwx",
    # simpleLine  (filter→sort→nth→add→scale, lagDiff→average→compareBool, 다중 findExtremum→diff, sum→diff 등)
    "1jabqwjz9pmd7qwz",
    "awg12vb36ndo75tq",
    "10gtgmmgh599jnr7",
    "95yhyqjyeu4fohbj",
    "0cymcilknp8krjwz",
    # multipleLine  (pairDiff/average/diff/count, filter→findExtremum→diff, retrieveValue→add→diff 등)
    "7extlfw651gqc5fk",
    "0b9o2vahkw2a1bxy",
    "3z678inbp0t89ahu",
    "b1jrtiwi2x01zdtw",
    "2s65jcap9pn289qx",
]

# API
API_BASE = "http://localhost:3000"
REQUEST_TIMEOUT_SEC = 600               # generate_grammar 는 LLM 다단계 호출이라 넉넉히
HEALTH_TIMEOUT_SEC = 10

# 출력 형식
#   "abstract": meta 에서 source/view 제거 + chartId 제거 (기존 chatgpt/gemini 파일과 동일한 형태 → 직접 비교 용이)
#   "raw":      API 응답의 ops 그룹을 그대로 (meta.source/view 포함)
META_MODE = "abstract"

# 이미 채워진 operation_spec 도 덮어쓸지
OVERWRITE = False

# MODE 별 grammar 생성 엔드포인트
ENDPOINT_BY_MODE = {
    "ours": "/generate_grammar",
    "baseline": "/generate_grammar_baseline",
}
# MODE 별 출력 파일 suffix (tech_eval_<target>_<suffix>.csv)
SUFFIX_BY_MODE = {"ours": "ours", "baseline": "baseline"}

# CSV 파일 경로
REPO_ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = REPO_ROOT / "data" / "review"


def csv_path_for(target: str, mode: str) -> Path:
    return REVIEW_DIR / f"tech_eval_{target}_{SUFFIX_BY_MODE[mode]}.csv"

# ──────────────────────────────────────────────────────────────────────────
# HTTP helpers (urllib 기반)
# ──────────────────────────────────────────────────────────────────────────


def _http_json(url: str, *, method: str, payload: Optional[dict], timeout: float) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body) if body.strip() else None


def _http_error_detail(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8")
        parsed = json.loads(body)
        if isinstance(parsed, dict) and "detail" in parsed:
            return f"HTTP {exc.code}: {parsed['detail']}"
        return f"HTTP {exc.code}: {body[:500]}"
    except Exception:
        return f"HTTP {exc.code}: {exc.reason}"


def check_health() -> None:
    try:
        res = _http_json(f"{API_BASE}/health", method="GET", payload=None, timeout=HEALTH_TIMEOUT_SEC)
    except Exception as exc:
        raise SystemExit(
            f"[ERROR] API 서버에 연결할 수 없습니다: {API_BASE} ({exc})\n"
            f"        nlp_server 를 먼저 띄우세요:  cd nlp_server && python main.py"
        )
    if not (isinstance(res, dict) and res.get("status") == "ok"):
        raise SystemExit(f"[ERROR] /health 응답이 비정상입니다: {res}")


# ──────────────────────────────────────────────────────────────────────────
# generate_grammar 호출
# ──────────────────────────────────────────────────────────────────────────


def call_generate_grammar(chart_id: str, question: str, explanation: str, mode: str) -> Dict[str, Any]:
    """chart_id -> request body 빌드 -> mode 엔드포인트 실행. 원본 응답(dict)을 반환."""
    # 1) 서버가 chart_id 로 ChartQA spec/csv 를 로딩해서 완전한 request body 생성
    req_payload = {
        "chart_id": chart_id,
        "question": question,
        "explanation": explanation,
        "debug": False,
        "llm_backend": LLM_BACKEND,
        "openai_model": OPENAI_MODEL,
    }
    if LLM_BACKEND == "ollama" and OLLAMA_MODEL:
        req_payload["ollama_model"] = OLLAMA_MODEL
    body = _http_json(
        f"{API_BASE}/generate_grammar_request_body",
        method="POST",
        payload=req_payload,
        timeout=HEALTH_TIMEOUT_SEC,
    )
    if not isinstance(body, dict):
        raise RuntimeError(f"request_body 응답이 dict 가 아님: {type(body)}")

    # 2) 실제 grammar 생성 (ours=recursive / baseline=single-shot)
    body["debug"] = False
    body["llm_backend"] = LLM_BACKEND
    if LLM_BACKEND == "ollama" and OLLAMA_MODEL:
        body["ollama_model"] = OLLAMA_MODEL
    endpoint = ENDPOINT_BY_MODE[mode]
    resp = _http_json(
        f"{API_BASE}{endpoint}",
        method="POST",
        payload=body,
        timeout=REQUEST_TIMEOUT_SEC,
    )
    if not isinstance(resp, dict):
        raise RuntimeError(f"{endpoint} 응답이 dict 가 아님: {type(resp)}")
    return resp


def _is_ops_group(key: str) -> bool:
    return key == "ops" or (key.startswith("ops") and key[3:].isdigit())


def to_operation_spec(resp: Dict[str, Any]) -> Dict[str, Any]:
    """API 응답을 operation_spec 컬럼에 넣을 형태로 변환 (ops 그룹만, text_chunks 제외)."""
    out: Dict[str, Any] = {}
    for key, val in resp.items():
        if not _is_ops_group(key) or not isinstance(val, list):
            continue
        ops_out: List[Dict[str, Any]] = []
        for op in val:
            if not isinstance(op, dict):
                continue
            op = dict(op)
            if META_MODE == "abstract":
                op.pop("chartId", None)
                meta = op.get("meta")
                if isinstance(meta, dict):
                    meta = dict(meta)
                    meta.pop("source", None)
                    meta.pop("view", None)
                    op["meta"] = meta
            ops_out.append(op)
        out[key] = ops_out
    return out


def count_ops(operation_spec: Dict[str, Any]) -> int:
    return sum(len(v) for v in operation_spec.values() if isinstance(v, list))


# ──────────────────────────────────────────────────────────────────────────
# CSV I/O
# ──────────────────────────────────────────────────────────────────────────


def load_csv(path: Path) -> tuple[List[str], List[Dict[str, str]]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    if "chart_id" not in fieldnames or "operation_spec" not in fieldnames:
        raise SystemExit(f"[ERROR] 필요한 컬럼이 없습니다 (chart_id, operation_spec): {path}")
    return fieldnames, rows


def save_csv_atomic(path: Path, fieldnames: List[str], rows: List[Dict[str, str]]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp, path)  # 원자적 교체


def append_log(log_path: Path, entry: Dict[str, Any]) -> None:
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# ──────────────────────────────────────────────────────────────────────────
# main
# ──────────────────────────────────────────────────────────────────────────


def main() -> None:
    global MODE, TARGET, LLM_BACKEND, OPENAI_MODEL, OLLAMA_MODEL, OVERWRITE, API_BASE

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["ours", "baseline"], default=MODE,
                        help="ours=/generate_grammar(DAG), baseline=/generate_grammar_baseline(plan-then-execute)")
    parser.add_argument("--target", choices=["chatgpt", "gemini", "human"], default=TARGET,
                        help="입력 설명 소스 (explanation 출처).")
    parser.add_argument("--backend", choices=["openai", "ollama"], default=LLM_BACKEND,
                        help="시스템 내부 LLM 백엔드. 기본값 openai(chatgpt). 로컬 테스트 시 ollama.")
    parser.add_argument("--model", default=OPENAI_MODEL,
                        help="OpenAI 모델명 (예: gpt-5.2-mini, gpt-4o). 기본값: gpt-5.2-mini. 서버 env 보다 우선.")
    parser.add_argument("--ollama-model", default=OLLAMA_MODEL,
                        help="Ollama 모델명 (예: qwen2.5:32b). backend=ollama 일 때만 적용. 서버 env 보다 우선.")
    parser.add_argument("--csv", default=None,
                        help="입출력 CSV 경로 직접 지정. 주면 --target/--mode 기반 자동 경로를 무시.")
    parser.add_argument("--all", action="store_true", help="CHART_IDS 무시하고 operation_spec 이 빈 모든 row 대상")
    parser.add_argument("--overwrite", action="store_true", help="이미 채워진 operation_spec 도 다시 생성")
    parser.add_argument("--dry-run", action="store_true", help="실제 호출 없이 대상 row 만 출력")
    parser.add_argument("--api-base", default=API_BASE)
    parser.add_argument("--limit", type=int, default=0, help="처리할 최대 row 수 (0=제한 없음)")
    args = parser.parse_args()

    MODE = args.mode
    TARGET = args.target
    LLM_BACKEND = args.backend
    OPENAI_MODEL = args.model or None
    OLLAMA_MODEL = args.ollama_model or None
    OVERWRITE = args.overwrite or OVERWRITE
    API_BASE = args.api_base.rstrip("/")

    csv_path = Path(args.csv).expanduser().resolve() if args.csv else csv_path_for(TARGET, MODE)
    if not csv_path.exists():
        raise SystemExit(f"[ERROR] CSV 가 없습니다: {csv_path}")
    log_path = csv_path.with_name(csv_path.stem + ".apifill.log.jsonl")

    fieldnames, rows = load_csv(csv_path)
    by_id: Dict[str, Dict[str, str]] = {r["chart_id"]: r for r in rows}

    # 처리 대상 chart_id 결정
    if args.all:
        target_ids = [r["chart_id"] for r in rows if not (r.get("operation_spec") or "").strip()]
        print(f"[INFO] --all: operation_spec 이 빈 row {len(target_ids)}개 대상")
    else:
        if not CHART_IDS:
            raise SystemExit(
                "[ERROR] CHART_IDS 가 비어있습니다. 코드 상단 CHART_IDS 에 chart_id 를 넣거나 --all 을 사용하세요."
            )
        target_ids = list(CHART_IDS)

    # CSV 에 실제로 존재하는 것만, 순서 유지하며 dedup
    seen = set()
    resolved: List[str] = []
    missing: List[str] = []
    for cid in target_ids:
        if cid in seen:
            continue
        seen.add(cid)
        if cid in by_id:
            resolved.append(cid)
        else:
            missing.append(cid)
    if missing:
        print(f"[WARN] CSV 에 없는 chart_id {len(missing)}개 무시: {missing[:10]}{' ...' if len(missing) > 10 else ''}")

    if args.limit > 0:
        resolved = resolved[: args.limit]

    print(f"[INFO] mode={MODE} endpoint={ENDPOINT_BY_MODE[MODE]} target(설명소스)={TARGET} file={csv_path.name}")
    if LLM_BACKEND == "ollama":
        model_note = OLLAMA_MODEL or "(서버 기본값)"
    else:
        model_note = OPENAI_MODEL or "(서버 env 기본값)"
    print(f"[INFO] 내부 LLM={LLM_BACKEND} model={model_note} meta_mode={META_MODE} overwrite={OVERWRITE}")
    print(f"[INFO] 대상 chart_id {len(resolved)}개")

    if args.dry_run:
        for cid in resolved:
            ours = bool((by_id[cid].get("operation_spec") or "").strip())
            print(f"  - {cid}  (현재 {'채워짐' if ours else '빈칸'})")
        print("[DRY-RUN] 실제 호출 없이 종료.")
        return

    check_health()

    n_ok = n_skip = n_fail = 0
    for i, cid in enumerate(resolved, start=1):
        row = by_id[cid]
        already = bool((row.get("operation_spec") or "").strip())
        if already and not OVERWRITE:
            n_skip += 1
            print(f"[{i}/{len(resolved)}] {cid}  SKIP (이미 채워짐)")
            continue

        question = (row.get("question") or "").strip()
        explanation = (row.get("explanation") or "").strip()
        if not question or not explanation:
            n_fail += 1
            print(f"[{i}/{len(resolved)}] {cid}  FAIL (question/explanation 비어있음)")
            append_log(log_path, {"chart_id": cid, "status": "skip_empty_input", "at": now_iso()})
            continue

        t0 = time.perf_counter()
        try:
            resp = call_generate_grammar(cid, question, explanation, MODE)
        except urllib.error.HTTPError as exc:
            n_fail += 1
            detail = _http_error_detail(exc)
            print(f"[{i}/{len(resolved)}] {cid}  FAIL ({detail[:160]})")
            append_log(log_path, {"chart_id": cid, "status": "http_error", "error": detail, "at": now_iso()})
            continue
        except Exception as exc:
            n_fail += 1
            print(f"[{i}/{len(resolved)}] {cid}  FAIL ({type(exc).__name__}: {exc})")
            append_log(log_path, {"chart_id": cid, "status": "error", "error": str(exc), "at": now_iso()})
            continue

        elapsed_ms = (time.perf_counter() - t0) * 1000
        operation_spec = to_operation_spec(resp)
        warnings = resp.get("warnings") if isinstance(resp.get("warnings"), list) else []

        # 컬럼 채우기 (기존 chatgpt/gemini 형식과 동일하게 compact JSON)
        row["operation_spec"] = json.dumps(operation_spec, ensure_ascii=False)
        if "updated_at" in fieldnames:
            row["updated_at"] = now_iso()

        save_csv_atomic(csv_path, fieldnames, rows)  # incremental save
        append_log(log_path, {
            "chart_id": cid,
            "mode": MODE,
            "status": "ok",
            "n_ops": count_ops(operation_spec),
            "groups": list(operation_spec.keys()),
            "warnings": warnings,
            "text_chunks": resp.get("text_chunks") or {},
            "elapsed_ms": round(elapsed_ms, 1),
            "at": now_iso(),
        })

        n_ok += 1
        warn_note = f" warnings={len(warnings)}" if warnings else ""
        print(f"[{i}/{len(resolved)}] {cid}  OK  ops={count_ops(operation_spec)} "
              f"groups={list(operation_spec.keys())}{warn_note}  ({elapsed_ms/1000:.1f}s)")

    print("\n=== 요약 ===")
    print(f"  OK   : {n_ok}")
    print(f"  SKIP : {n_skip}")
    print(f"  FAIL : {n_fail}")
    print(f"  CSV  : {csv_path}")
    print(f"  LOG  : {log_path}")


if __name__ == "__main__":
    main()

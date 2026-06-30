#!/usr/bin/env python3
"""
generate_grammar 실패의 근본 원인을 자동 분류/집계하는 분석 도구.

fill_operation_spec_via_api.py 가 남긴 sidecar 로그(*.apifill.log.jsonl)를 읽어
실패(status != "ok") 건마다:
  1) 에러 메시지에서 단계(inventory|step-compose), step 번호, op, validator 유형, detail 파싱
  2) error 안의 debug_bundle 경로에서 02_inventory.json(=Inventory 가 정한 op 시퀀스)과
     실패 step 의 03_step_NN_compose.json(=LLM raw 응답)을 로드
  3) 실패 유형을 규칙 기반으로 분류
을 수행하고, 유형별/단계별/차트타입별로 집계해서 출력한다.

핵심 질문: "실패가 Inventory(op-type/hint 결정) 탓인가, step-compose(작성) 탓인가?"
  - sum_on_line / diff_absolute_hint 같은 유형은 Inventory 가 잘못 결정 → step-compose 가
    frozen 이라 회복 못 함 (근본 원인 = Inventory).
  - scalar_operand_missing 같은 유형은 step-compose 가 operand 노드를 안 만들고 진행 (작성 탓).

사용 예
-------
  python scripts/analyze_grammar_failures.py data/review/tech_eval_human_gpt54nano_ours.apifill.log.jsonl
  python scripts/analyze_grammar_failures.py <jsonl> --verbose   # 건별 Inventory op 시퀀스까지 출력
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# CHART_IDS 순서(타입 매핑) — fill 스크립트와 동일하게 유지
CHART_IDS = [
    "0k7bm9iqewnrzj47", "0ijwrg723j4v8s3e", "0cad2xfrwdgvo9zk", "1hlsoeyqlr1r1n41", "1lf1h5jf9ymeid5q",
    "1x37jzohqd666qc0", "0bgcjlbz7nv5vnjc", "0ihx2vzdsej883sq", "221xoyhy3yziwabm", "0lua5jsw92d3enb4",
    "c3mncg8r4g6bjoon", "0vfqjaxeiv96ww7g", "0gzowodb2py0d1s9", "9g5a38vcep03acdu", "1xz4egh52kvh2xwx",
    "1jabqwjz9pmd7qwz", "awg12vb36ndo75tq", "10gtgmmgh599jnr7", "95yhyqjyeu4fohbj", "0cymcilknp8krjwz",
    "7extlfw651gqc5fk", "0b9o2vahkw2a1bxy", "3z678inbp0t89ahu", "b1jrtiwi2x01zdtw", "2s65jcap9pn289qx",
]
TYPES = ["simpleBar"] * 5 + ["groupedBar"] * 5 + ["stackedBar"] * 5 + ["simpleLine"] * 5 + ["multipleLine"] * 5
TYPE_BY_ID = dict(zip(CHART_IDS, TYPES))


# (정규식, 유형코드, 근본책임 단계) — 위에서부터 먼저 매칭
CLASSIFY_RULES: List[Tuple[re.Pattern, str, str]] = [
    (re.compile(r'sum is allowed only for bar', re.I), "sum_on_line", "inventory(op-choice)"),
    (re.compile(r'outside series domain', re.I), "series_group_domain", "step-compose(group)"),
    (re.compile(r'paramsHint has forbidden key "(\w+)" for op "(\w+)"', re.I), "inventory_hint_forbidden_key", "inventory(hint)"),
    (re.compile(r'정확히 2개의 nodeId가 필요|targetA는 필수|targetB는 필수|unknown or future nodeId', re.I), "scalar_operand_missing", "step-compose(operands)"),
    (re.compile(r'must be a scalar or list of scalars', re.I), "inventory_hint_shape", "inventory(hint)"),
    (re.compile(r'op_spec\.op must be a non-empty string', re.I), "empty_op_spec", "step-compose(format)"),
    (re.compile(r'Scalar reference rule violated', re.I), "ref_format", "step-compose(ref)"),
    # held-out discovery 패턴 (25개 밖)
    (re.compile(r'filter between start ".+?" not found', re.I), "filter_between_boundary", "step-compose(filter-bounds)"),
    (re.compile(r'filter on series_field ".+?" is forbidden', re.I), "filter_on_series_field", "step-compose(filter-field)"),
    (re.compile(r'filter comparison mode requires numeric', re.I), "filter_compare_nonnumeric", "step-compose(filter-field)"),
    (re.compile(r'rank=\d+ exceeds available rows', re.I), "rank_exceeds_rows", "step-compose(rank)"),
    (re.compile(r'seriesField ".+?" must be one of', re.I), "seriesfield_grounding", "step-compose(grounding)"),
    (re.compile(r'validation error for tagged-union', re.I), "schema_union_error", "step-compose(schema)"),
]


def classify(error: str) -> Tuple[str, str, str]:
    """에러 문자열 -> (유형코드, 근본책임단계, 추가detail). 미매칭은 'other'."""
    for pat, code, stage in CLASSIFY_RULES:
        m = pat.search(error or "")
        if m:
            extra = m.group(0)
            return code, stage, extra
    return "other", "?", ""


def parse_stage(error: str) -> str:
    if "inventory failed" in error:
        return "inventory"
    if "step-compose failed" in error:
        return "step-compose"
    return "?"


def parse_step_no(error: str) -> Optional[int]:
    m = re.search(r"step-compose failed after strict retries \(step=(\d+)\)", error or "")
    return int(m.group(1)) if m else None


def parse_selected_op(error: str) -> Optional[str]:
    m = re.search(r"taskId=\w+, op=(\w+)", error or "")
    return m.group(1) if m else None


def parse_bundle_path(error: str) -> Optional[Path]:
    m = re.search(r"debug_bundle=([^\s)]+)", error or "")
    return Path(m.group(1)) if m else None


def load_inventory_ops(bundle: Optional[Path]) -> List[Dict[str, Any]]:
    """02_inventory.json 에서 Inventory 가 정한 op 시퀀스(op + paramsHint) 추출."""
    if not bundle:
        return []
    inv = bundle / "02_inventory.json"
    if not inv.exists():
        return []
    try:
        d = json.loads(inv.read_text(encoding="utf-8"))
    except Exception:
        return []
    out = []
    for t in d.get("tasks", []):
        out.append({"taskId": t.get("taskId"), "op": t.get("op"),
                    "hint": t.get("paramsHint", {}), "mention": t.get("mention", "")})
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("jsonl", help="*.apifill.log.jsonl 경로")
    ap.add_argument("--verbose", action="store_true", help="건별 Inventory op 시퀀스까지 출력")
    ap.add_argument("--types-csv", default=None,
                    help="chart_id→chart_type 매핑 CSV (held-out 등 25개 밖 케이스용). chart_type 컬럼 사용.")
    args = ap.parse_args()

    # held-out: 하드코딩된 25개 외 chart_id의 타입을 CSV에서 보충.
    _CT_NORMAL = {
        "bar_simple": "simpleBar", "bar_grouped": "groupedBar", "bar_stacked": "stackedBar",
        "line_simple": "simpleLine", "line_multiple": "multipleLine",
    }
    if args.types_csv:
        import csv as _csv
        with open(args.types_csv, newline="") as _f:
            for _r in _csv.DictReader(_f):
                ct = (_r.get("chart_type") or "").strip()
                TYPE_BY_ID[_r.get("chart_id")] = _CT_NORMAL.get(ct, ct or "?")

    path = Path(args.jsonl)
    if not path.exists():
        raise SystemExit(f"[ERROR] 파일 없음: {path}")

    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    fails = [r for r in rows if r.get("status") != "ok"]
    oks = [r for r in rows if r.get("status") == "ok"]

    print(f"# 분석: {path.name}")
    print(f"  완료 {len(rows)} | OK {len(oks)} | FAIL {len(fails)}")

    by_type_code: Counter = Counter()
    by_stage_resp: Counter = Counter()
    by_charttype: defaultdict = defaultdict(Counter)
    details: List[Dict[str, Any]] = []

    for r in fails:
        err = r.get("error", "") or ""
        code, root_stage, extra = classify(err)
        stage = parse_stage(err)
        step_no = parse_step_no(err)
        sel_op = parse_selected_op(err)
        bundle = parse_bundle_path(err)
        inv_ops = load_inventory_ops(bundle)
        cid = r.get("chart_id")
        ctype = TYPE_BY_ID.get(cid, "?")

        by_type_code[code] += 1
        by_stage_resp[root_stage] += 1
        by_charttype[ctype][code] += 1
        details.append({"chart_id": cid, "ctype": ctype, "code": code, "root": root_stage,
                        "stage": stage, "step": step_no, "op": sel_op,
                        "inv_ops": inv_ops, "detail": extra})

    print("\n## 실패 유형별 집계")
    for code, n in by_type_code.most_common():
        print(f"  {n:2}  {code}")

    print("\n## 근본 책임 단계")
    for st, n in by_stage_resp.most_common():
        print(f"  {n:2}  {st}")

    print("\n## 차트타입 × 유형")
    _type_order = ["simpleBar", "groupedBar", "stackedBar", "simpleLine", "multipleLine"]
    _present = [t for t in _type_order if by_charttype.get(t)] + \
               [t for t in by_charttype if t not in _type_order]
    for ct in _present:
        if by_charttype[ct]:
            items = ", ".join(f"{c}×{n}" for c, n in by_charttype[ct].most_common())
            print(f"  {ct:13} {items}")

    print("\n## 건별")
    for d in details:
        loc = f"{d['stage']}" + (f"[step{d['step']}]" if d["step"] else "") + (f" op={d['op']}" if d["op"] else "")
        print(f"  {d['chart_id']} [{d['ctype']}] -> {d['code']} ({d['root']}) | {loc}")
        if args.verbose and d["inv_ops"]:
            seq = " -> ".join(f"{o['op']}" for o in d["inv_ops"])
            print(f"        Inventory 시퀀스: {seq}")
            for o in d["inv_ops"]:
                hint = json.dumps(o["hint"], ensure_ascii=False)
                print(f"          {o['taskId']}: {o['op']:12} hint={hint[:70]} | {o['mention'][:45]}")


if __name__ == "__main__":
    main()

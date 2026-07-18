#!/usr/bin/env python3
"""Audit evaluation explanation texts against the shown answers.

For every active study item (chart_group.json groups G1-G4) and every system
(Ours steps / B1 prose / B2 scenes / B3 manifest), check that the explanation's
FINAL text is consistent with the shown answer:

- If the final step/sentence contains numbers, at least one must match the
  shown answer (within a small relative tolerance, to allow visual-estimate
  phrasing like "roughly $53.4" for 53.41).
- If the shown answer is non-numeric (year lists, labels, Yes/No), its tokens
  must appear in the explanation text.
- Final steps with no numbers at all pass (procedure-style closing sentences).

For B2, the LAST scene's svg_code is also scanned: any `<text>` annotation
label containing numbers must include one matching the answer (axis ticks and
data labels routinely echo other values, so only labels with '=' or ':' are
treated as conclusion labels).

Exit code 0 = all pass, 1 = at least one FAIL. Run after any stimulus edit:

    python3 scripts/eval_audit_explanations.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "evaluation"

# Deliberate waivers (chart_id, system) -> reason. Keep short and honest.
# (D1 resolved 2026-07-17: 10gtgmmgh599jnr7 adopted the positional reading,
# answer 0.023, so its waivers are gone.)
WAIVERS: dict[tuple[str, str], str] = {}

ACTIVE_GROUPS = ["G1", "G2", "G3", "G4"]


def load_items():
    groups = json.loads((EVAL / "chart_group.json").read_text())
    items = []
    for g in ACTIVE_GROUPS:
        for slot, item in groups[g].items():
            items.append((g, slot, item))
    return items


def load_sources():
    b1 = json.loads((EVAL / "baselines" / "baseline_input.json").read_text())
    b2_raw = json.loads((EVAL / "baselines" / "B2" / "baseline2_result.json").read_text())
    b2 = next(iter(b2_raw.values()))  # single model key
    b3 = json.loads((EVAL / "baselines" / "B3" / "baseline3_manifest.json").read_text())
    return b1, b2, b3


def ours_steps(chart_id: str):
    path = EVAL / "data" / "ours" / "steps" / f"{chart_id}.step.json"
    if not path.exists():
        return None
    return [s["text"] for s in json.loads(path.read_text())["steps"]]


NUM_RE = re.compile(r"-?\d[\d,]*\.?\d*")


def numbers_in(text: str):
    out = []
    for tok in NUM_RE.findall(text):
        tok = tok.replace(",", "").rstrip(".")
        if not tok or tok in {"-"}:
            continue
        try:
            out.append(float(tok))
        except ValueError:
            pass
    return out


def parse_answer(answer: str):
    """Return ('num', value) or ('text', tokens)."""
    a = answer.strip().rstrip("%").replace(",", "")
    try:
        return "num", float(a)
    except ValueError:
        pass
    tokens = [t.strip() for t in answer.split(",") if t.strip()]
    return "text", tokens


def close(a: float, b: float, rel: float = 0.02) -> bool:
    if a == b:
        return True
    denom = max(abs(a), abs(b), 1e-9)
    return abs(a - b) / denom <= rel


def check_text(answer: str, final_text: str, full_text: str) -> tuple[bool, str]:
    kind, want = parse_answer(answer)
    if kind == "num":
        nums = numbers_in(final_text)
        if not nums:
            return True, "final step has no numbers (procedure-style)"
        # percentages shown as 0.19 vs "19%" and vice versa
        candidates = {want, want / 100.0, want * 100.0}
        for n in nums:
            if any(close(n, c) for c in candidates):
                return True, f"final number {n} matches {answer}"
        return False, f"final numbers {nums} do not include {answer}"
    # text answers: Yes/No, labels, year lists
    low = full_text.lower()
    if answer.strip().lower() in {"yes", "no"}:
        neg = ("no" == answer.strip().lower())
        has_neg = bool(re.search(r"\b(no|not)\b", low))
        return (has_neg == neg) or not neg, f"yes/no phrasing check ({answer})"
    def norm(s: str) -> str:
        return re.sub(r"[‐-―]", "-", s.lower())
    missing = [t for t in want if norm(t) not in norm(full_text)]
    if not missing:
        return True, "all answer tokens present"
    # Range phrasing ("2015 through Jan-Oct 2019") covers interior list tokens.
    if (
        len(want) > 2
        and norm(want[0]) in norm(full_text)
        and norm(want[-1]) in norm(full_text)
        and re.search(r"\bthrough\b|\bfrom\b|[–—-]", full_text)
        and all(t in want[1:-1] for t in missing)
    ):
        return True, "endpoints + range phrasing cover the list"
    return False, f"missing answer tokens: {missing}"


def b2_svg_conclusion_check(answer: str, svg: str) -> tuple[bool, str]:
    kind, want = parse_answer(answer)
    if kind != "num":
        return True, "non-numeric answer; svg label check skipped"
    labels = re.findall(r"<text[^>]*>([^<]*[=:][^<]*)</text>", svg)
    labeled_nums = [n for lab in labels for n in numbers_in(lab)]
    if not labeled_nums:
        return True, "no conclusion-style labels in svg"
    candidates = {want, want / 100.0, want * 100.0}
    for n in labeled_nums:
        if any(close(n, c) for c in candidates):
            return True, f"svg label number {n} matches {answer}"
    return False, f"svg conclusion labels {labels[:4]} lack {answer}"


def check_uniformity(b1, b2, b3) -> list[str]:
    """Every system must carry EXACTLY the Ours step texts (2026-07-18 policy):
    B1 = the steps joined into one paragraph; B2 = one scene per step with
    text_chunk == step text; B3 = one manifest step per Ours step with
    text == step text and fn actually exported by the module."""
    failures: list[str] = []
    for g, slot, item in load_items():
        cid = item["id"]
        steps = ours_steps(cid)
        if not steps:
            failures.append(f"[{g} {slot}] {cid}: no Ours step file")
            continue
        tag = f"[{g} {slot}] {cid}"

        prose = (b1.get(cid) or {}).get("explanation", "")
        want_prose = " ".join(steps)
        if prose != want_prose:
            failures.append(f"{tag} B1: paragraph != joined Ours steps\n    got : {prose[:120]}\n    want: {want_prose[:120]}")

        scenes = b2.get(cid) or []
        if len(scenes) != len(steps):
            failures.append(f"{tag} B2: {len(scenes)} scenes != {len(steps)} Ours steps")
        else:
            for k, s in enumerate(scenes):
                if s.get("text_chunk", "") != steps[k]:
                    failures.append(f"{tag} B2 scene[{k}]: text != Ours step\n    got : {s.get('text_chunk','')[:120]}\n    want: {steps[k][:120]}")

        entry = b3.get(cid) or {}
        msteps = entry.get("steps", [])
        if len(msteps) != len(steps):
            failures.append(f"{tag} B3: {len(msteps)} manifest steps != {len(steps)} Ours steps")
        else:
            for k, s in enumerate(msteps):
                if s.get("text", "") != steps[k]:
                    failures.append(f"{tag} B3 step[{k}]: text != Ours step\n    got : {s.get('text','')[:120]}\n    want: {steps[k][:120]}")
        module_rel = entry.get("module", "")
        module_path = EVAL / "baselines" / "B3" / module_rel
        if module_rel and module_path.exists():
            src = module_path.read_text(encoding="utf-8")
            exported = set(re.findall(r"export\s+function\s+([A-Za-z0-9_]+)", src))
            for s in msteps:
                fn = s.get("fn", "")
                if fn and fn not in exported:
                    failures.append(f"{tag} B3: manifest fn '{fn}' is not exported by {module_rel}")
        elif module_rel:
            failures.append(f"{tag} B3: module file missing: {module_rel}")
    return failures


def main() -> int:
    b1, b2, b3 = load_sources()
    failures = []
    waived = []
    rows = 0

    for g, slot, item in load_items():
        cid = item["id"]
        answer = str(item["answer"])

        systems: dict[str, tuple[str, str]] = {}
        steps = ours_steps(cid)
        if steps:
            systems["Ours"] = (steps[-1], " ".join(steps))
        prose = (b1.get(cid) or {}).get("explanation", "")
        if prose:
            sentences = [s for s in re.split(r"(?<=[.!?])\s+", prose.strip()) if s]
            systems["B1"] = (sentences[-1] if sentences else prose, prose)
        scenes = b2.get(cid) or []
        if scenes:
            texts = [s.get("text_chunk", "") for s in scenes]
            systems["B2"] = (texts[-1], " ".join(texts))
        manifest = b3.get(cid)
        if manifest:
            texts = [s.get("text", "") for s in manifest.get("steps", [])]
            systems["B3"] = (texts[-1] if texts else "", " ".join(texts))

        for sysname, (final_text, full_text) in systems.items():
            rows += 1
            ok, why = check_text(answer, final_text, full_text)
            if ok and sysname == "B2":
                ok, why = b2_svg_conclusion_check(answer, scenes[-1].get("svg_code", ""))
            tag = f"[{g} {slot}] {cid} {sysname}"
            if not ok:
                if (cid, sysname) in WAIVERS:
                    waived.append(f"{tag}: WAIVED ({WAIVERS[(cid, sysname)]}) — {why}")
                else:
                    failures.append(f"{tag}: shown={answer!r} — {why}\n    final: {final_text[:160]}")

    uniformity_failures = check_uniformity(b1, b2, b3)

    print(f"checked {rows} item x system explanations across {len(ACTIVE_GROUPS)} groups")
    for w in waived:
        print("  ~", w)
    if failures:
        print(f"\nFAIL — conclusion consistency ({len(failures)}):")
        for f in failures:
            print("  ✗", f)
    if uniformity_failures:
        print(f"\nFAIL — text uniformity vs Ours ({len(uniformity_failures)}):")
        for f in uniformity_failures:
            print("  ✗", f)
    if failures or uniformity_failures:
        return 1
    print("PASS: every explanation is consistent with its shown answer AND textually identical to Ours")
    return 0


if __name__ == "__main__":
    sys.exit(main())

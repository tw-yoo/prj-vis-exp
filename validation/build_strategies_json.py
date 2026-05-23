"""Build a strategies JSON file from one of the expert-collection CSVs.

Usage: edit CSV_PATH (and optionally OUTPUT_PATH) below, then run:
    python validation/build_strategies_json.py
"""

import csv
import json
from collections import OrderedDict
from pathlib import Path


CSV_PATH = "/Users/taewon_1/Desktop/vis-exp/expert-collection/strategies/e10_strategies.csv"
OUTPUT_PATH = ""  # leave empty to derive from CSV name (e.g. e2_strategies.json next to CSV)


def build_strategies(csv_path: str) -> "OrderedDict[str, dict]":
    result: "OrderedDict[str, dict]" = OrderedDict()

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            file_path = (row.get("file_path") or "").strip()
            if not file_path:
                continue
            key = Path(file_path).stem  # e.g. "e2_q1"
            order_raw = (row.get("Order") or "").strip()
            if not order_raw:
                continue
            order = int(order_raw)
            question = (row.get("Question") or "").strip()
            explanation = row.get("Explanation") or ""

            entry = result.setdefault(key, {"question": question, "explanation": OrderedDict()})
            if question and not entry["question"]:
                entry["question"] = question
            entry["explanation"][f"function{order}"] = explanation

    return result


def main() -> None:
    csv_path = Path(CSV_PATH)
    out_path = Path(OUTPUT_PATH) if OUTPUT_PATH else csv_path.with_suffix(".json")

    data = build_strategies(str(csv_path))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(data)} questions -> {out_path}")


if __name__ == "__main__":
    main()

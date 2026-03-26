import csv
import json
import os
from pathlib import Path
from typing import List, Dict

import requests

API_URL = os.getenv("ANSWER_API_URL", "http://localhost:3000/answer_question")
MODULE_TRACE_URL = os.getenv("MODULE_TRACE_URL", "http://localhost:3000/run_module_trace")
GRAMMAR_API_URL = os.getenv("GRAMMAR_API_URL", "http://localhost:3000/generate_grammar")
OUTPUT_CSV = Path("test.csv")

# {
#     "question": "Which region is highest?",
#     "vega_lite_spec_path": "data/test/spec/bar_stacked_ver.json",
#     "data_csv_path": "data/test/data/bar_stacked_ver.csv",
#     "llm": "chatgpt",  # optional; defaults to chatgpt
# }
data: List[Dict[str, str]] = [
    # {
    #     "question": "which season was above average in both commercial and broadcasting?",
    #     "vega_lite_spec_path": "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/vlSpec/bar/stacked/10x2rgiqw97wdspi.json",
    #     "data_csv_path": "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/csv/bar/stacked/10x2rgiqw97wdspi.csv",
    #     "llm": "chatgpt"
    # },
    # {
    #     "question": "which year shows the lowest gap between lending and investment?",
    #     "vega_lite_spec_path": "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/vlSpec/bar/grouped/0rdpculfpyw3bv5p.json",
    #     "data_csv_path": "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/csv/bar/grouped/0rdpculfpyw3bv5p.csv",
    #     "llm": "chatgpt"
    # },
    {
        "question": "which city had the biggest jump in population from 2010 to 2025?",
        "vega_lite_spec_path": "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/vlSpec/bar/grouped/0prhtod4tli879nh.json",
        "data_csv_path": "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/csv/bar/grouped/0prhtod4tli879nh.csv",
        "llm": "chatgpt"
    }
]


HEADERS = ["chart_id", "question", "llm", "answer", "explanation", "chart_context", "grammar", "inventory", "steps"]


def _ensure_csv_headers(existing: bool) -> None:
    if not existing:
        with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fp:
            writer = csv.writer(fp)
            writer.writerow(HEADERS)
        return

    with OUTPUT_CSV.open("r", newline="", encoding="utf-8") as fp:
        reader = csv.reader(fp)
        try:
            first = next(reader)
        except StopIteration:
            first = []
    if first != HEADERS:
        OUTPUT_CSV.unlink(missing_ok=True)
        with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fp:
            writer = csv.writer(fp)
            writer.writerow(HEADERS)


def _read_seen() -> List[tuple[str, str]]:
    if not OUTPUT_CSV.exists():
        return []
    seen = []
    with OUTPUT_CSV.open("r", newline="", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        for row in reader:
            chart = row.get("chart_id", "")
            question = row.get("question", "")
            seen.append((chart, question))
    return seen


def _chart_id_from_spec(path: str) -> str:
    candidate = Path(path).name
    if ". " in candidate and candidate.lower().startswith("chart"):
        tail = candidate.split(". ", 1)[1]
        return Path(tail).stem
    return Path(candidate).stem


def _read_csv_rows(path: str) -> List[Dict[str, str]]:
    with Path(path).open("r", newline="", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        return [dict(row) for row in reader]


def _call_answer(entry: Dict[str, str]) -> Dict[str, str]:
    payload = {
        "question": entry["question"],
        "vega_lite_spec_path": entry["vega_lite_spec_path"],
        "data_csv_path": entry["data_csv_path"],
        "llm": entry.get("llm", "chatgpt"),
        "debug": False,
    }
    resp = requests.post(API_URL, json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    existing = OUTPUT_CSV.exists()
    _ensure_csv_headers(existing)
    seen = set(_read_seen())

    for entry in data:
        chart_id = _chart_id_from_spec(entry["vega_lite_spec_path"])
        pair = (chart_id, entry["question"])
        if pair in seen:
            continue

        result = _call_answer(entry)
        rows = _read_csv_rows(entry["data_csv_path"])
        with Path(entry["vega_lite_spec_path"]).open("r", encoding="utf-8") as spec_fp:
            spec = json.load(spec_fp)
        grammar_payload = {
            "question": entry["question"],
            "explanation": result["explanation"],
            "vega_lite_spec": spec,
            "data_rows": rows,
            "debug": False,
        }
        grammar_resp = requests.post(GRAMMAR_API_URL, json=grammar_payload, timeout=120)
        try:
            grammar_resp.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            print("grammar request failed:", grammar_resp.text)
            raise
        grammar = grammar_resp.json()
        module_trace_resp = requests.post(
            MODULE_TRACE_URL,
            json={
                "question": entry["question"],
                "explanation": result["explanation"],
                "vega_lite_spec_path": entry["vega_lite_spec_path"],
                "data_csv_path": entry["data_csv_path"],
            },
            timeout=120,
        )
        module_trace_resp.raise_for_status()
        module_trace = module_trace_resp.json()
        row = [
            chart_id,
            entry["question"],
            entry.get("llm", "chatgpt"),
            result["answer"],
            result["explanation"],
            json.dumps(module_trace.get("chart_context", {}), ensure_ascii=False),
            json.dumps(grammar, ensure_ascii=False),
            json.dumps(module_trace.get("inventory", {}), ensure_ascii=False),
            json.dumps(module_trace.get("steps", []), ensure_ascii=False),
        ]
        row = ["" if value is None else value for value in row]
        with OUTPUT_CSV.open("a", newline="", encoding="utf-8") as fp:
            writer = csv.writer(fp)
            writer.writerow(row)
        seen.add(pair)


if __name__ == "__main__":
    main()

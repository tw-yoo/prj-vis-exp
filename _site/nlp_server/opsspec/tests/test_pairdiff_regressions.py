from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path
from typing import Dict, List

from opsspec.runtime.context_builder import build_chart_context
from opsspec.specs.compare import PairDiffOp
from opsspec.validation.validators import validate_operation


def _repo_root() -> Path:
    # .../prj-vis-exp/prj-vis-exp
    return Path(__file__).resolve().parents[3]


def _load_chartqa_case(case_id: str) -> tuple[Dict[str, object], List[Dict[str, str]]]:
    root = _repo_root()
    vl_candidates = list((root / "ChartQA" / "data" / "vlSpec").glob(f"**/{case_id}.json"))
    csv_candidates = list((root / "ChartQA" / "data" / "csv").glob(f"**/{case_id}.csv"))
    if not vl_candidates or not csv_candidates:
        raise RuntimeError(f"missing ChartQA files for case_id={case_id}")

    vega_lite_spec = json.loads(vl_candidates[0].read_text(encoding="utf-8"))
    with csv_candidates[0].open("r", encoding="utf-8", newline="") as f:
        data_rows = list(csv.DictReader(f))
    return vega_lite_spec, data_rows


class PairDiffRegressionTest(unittest.TestCase):
    def test_layered_multiline_context_is_inferred_correctly_23wg8(self) -> None:
        vega_lite_spec, data_rows = _load_chartqa_case("23wg8zio5ahp40tg")
        ctx, warnings, _ = build_chart_context(vega_lite_spec, data_rows)

        self.assertEqual(ctx.mark, "line")
        self.assertFalse(ctx.is_stacked)
        self.assertEqual(ctx.primary_dimension, "Year")
        self.assertEqual(ctx.primary_measure, "Percentage")
        self.assertEqual(ctx.series_field, "Opinion")
        self.assertIn("Year", ctx.dimension_fields)
        self.assertIn("Opinion", ctx.dimension_fields)
        self.assertIn("Percentage", ctx.measure_fields)
        self.assertEqual(warnings, [])

    def test_layered_multiline_context_is_inferred_correctly_3z678(self) -> None:
        vega_lite_spec, data_rows = _load_chartqa_case("3z678inbp0t89ahu")
        ctx, warnings, _ = build_chart_context(vega_lite_spec, data_rows)

        self.assertEqual(ctx.mark, "line")
        self.assertFalse(ctx.is_stacked)
        self.assertEqual(ctx.primary_dimension, "Year")
        self.assertEqual(ctx.primary_measure, "Percentage_of_Respondents")
        self.assertEqual(ctx.series_field, "Opinion")
        self.assertIn("Year", ctx.dimension_fields)
        self.assertIn("Opinion", ctx.dimension_fields)
        self.assertIn("Percentage_of_Respondents", ctx.measure_fields)
        self.assertEqual(warnings, [])

    def test_pairdiff_autocorrects_seriesfield_and_by_when_swapped(self) -> None:
        vega_lite_spec, data_rows = _load_chartqa_case("0prhtod4tli879nh")
        ctx, _, _ = build_chart_context(vega_lite_spec, data_rows)

        # 회귀 케이스: groupA/B는 Year 도메인 값인데 seriesField를 City로 잘못 지정.
        op = PairDiffOp(
            op="pairDiff",
            by="Year",
            seriesField="City",
            field="Population in millions",
            groupA="2010",
            groupB="2025",
            signed=True,
            absolute=False,
        )
        normalized, warnings = validate_operation(op, chart_context=ctx)

        self.assertEqual(normalized.seriesField, "Year")
        self.assertEqual(normalized.by, "City")
        self.assertTrue(any("seriesField corrected" in w for w in warnings))
        self.assertTrue(any("by field changed" in w or "by field corrected" in w for w in warnings))

    def test_pairdiff_stays_stable_on_multiline_case(self) -> None:
        vega_lite_spec, data_rows = _load_chartqa_case("3z678inbp0t89ahu")
        ctx, _, _ = build_chart_context(vega_lite_spec, data_rows)

        op = PairDiffOp(
            op="pairDiff",
            by="Year",
            seriesField="Opinion",
            field="Percentage_of_Respondents",
            groupA="Dissatisfied",
            groupB="Satisfied",
            signed=True,
            absolute=False,
        )
        normalized, warnings = validate_operation(op, chart_context=ctx)

        self.assertEqual(normalized.by, "Year")
        self.assertEqual(normalized.seriesField, "Opinion")
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()

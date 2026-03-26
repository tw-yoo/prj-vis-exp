from __future__ import annotations

import unittest

from draw_plan.build_draw_plan import build_draw_ops_spec
from opsspec.core.models import ChartContext
from opsspec.specs.base import OpsMeta
from opsspec.specs.compare import CompareOp, DiffOp, PairDiffOp
from opsspec.specs.filter import FilterOp
from opsspec.specs.aggregate import AverageOp
from opsspec.specs.aggregate import SumOp
from opsspec.specs.add import AddOp
from opsspec.specs.scale import ScaleOp
from opsspec.specs.set_op import SetOp
from opsspec.specs.range_sort_select import DetermineRangeOp, FindExtremumOp
from opsspec.runtime.scheduler import schedule_ops_spec


class DrawPlanTest(unittest.TestCase):
    def test_builds_draw_ops_for_scalar_and_target_results(self) -> None:
        context = ChartContext(
            fields=["month", "weather", "count"],
            dimension_fields=["month", "weather"],
            measure_fields=["count"],
            primary_dimension="month",
            primary_measure="count",
            series_field="weather",
            categorical_values={
                "month": ["Jan", "Feb", "Mar"],
                "weather": ["rain", "sun"],
            },
            mark="bar",
            is_stacked=True,
        )
        data_rows = [
            {"month": "Jan", "weather": "rain", "count": 10},
            {"month": "Feb", "weather": "rain", "count": 20},
            {"month": "Mar", "weather": "rain", "count": 30},
            {"month": "Jan", "weather": "sun", "count": 12},
            {"month": "Feb", "weather": "sun", "count": 16},
            {"month": "Mar", "weather": "sun", "count": 18},
        ]
        ops_spec = {
            "ops": [
                AverageOp(op="average", field="count", group="rain", meta=OpsMeta(nodeId="n1", sentenceIndex=1)),
                FilterOp(
                    op="filter",
                    field="count",
                    operator=">",
                    value="ref:n1",
                    group="rain",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
                ),
            ]
        }

        draw_plan = build_draw_ops_spec(
            ops_spec=ops_spec,
            chart_context=context,
            data_rows=data_rows,
            vega_lite_spec={"mark": "bar"},
        )
        ops = draw_plan.get("ops", [])

        self.assertTrue(any(op.get("action") == "line" for op in ops))
        self.assertTrue(any(op.get("action") == "text" for op in ops))
        # Group-scoped filter should not force red highlight (preserve stacked series colors).
        self.assertFalse(any(op.get("action") == "highlight" for op in ops))
        self.assertTrue(any(op.get("action") == "stacked-filter-groups" for op in ops))
        self.assertTrue(
            any(
                op.get("action") == "text"
                and isinstance(op.get("text"), dict)
                and isinstance(op.get("text", {}).get("position"), dict)
                and float(op.get("text", {}).get("position", {}).get("y")) >= 0.9
                for op in ops
            )
        )
        self.assertTrue(
            any(
                op.get("action") == "stacked-filter-groups"
                and isinstance(op.get("groupFilter"), dict)
                and op.get("groupFilter", {}).get("groups") == ["rain"]
                for op in ops
            )
        )

    def test_builds_extended_draw_ops_for_set_pair_add_scale(self) -> None:
        context = ChartContext(
            fields=["month", "weather", "count"],
            dimension_fields=["month", "weather"],
            measure_fields=["count"],
            primary_dimension="month",
            primary_measure="count",
            series_field="weather",
            categorical_values={
                "month": ["Jan", "Feb", "Mar"],
                "weather": ["rain", "sun"],
            },
            mark="bar",
            is_stacked=False,
        )
        data_rows = [
            {"month": "Jan", "weather": "rain", "count": 10},
            {"month": "Feb", "weather": "rain", "count": 20},
            {"month": "Mar", "weather": "rain", "count": 30},
            {"month": "Jan", "weather": "sun", "count": 12},
            {"month": "Feb", "weather": "sun", "count": 16},
            {"month": "Mar", "weather": "sun", "count": 18},
        ]
        ops_spec = {
            "ops": [
                FilterOp(op="filter", field="count", operator=">", value=0, group="rain", meta=OpsMeta(nodeId="n1", sentenceIndex=1)),
                FilterOp(op="filter", field="count", operator=">", value=0, group="sun", meta=OpsMeta(nodeId="n2", sentenceIndex=1)),
                SetOp(op="setOp", fn="intersection", meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=1)),
                PairDiffOp(
                    op="pairDiff",
                    by="month",
                    seriesField="weather",
                    field="count",
                    groupA="rain",
                    groupB="sun",
                    meta=OpsMeta(nodeId="n4", sentenceIndex=1),
                ),
                AddOp(op="add", targetA="Jan", targetB="Feb", field="count", meta=OpsMeta(nodeId="n5", sentenceIndex=1)),
                ScaleOp(op="scale", target="Mar", factor=2, field="count", meta=OpsMeta(nodeId="n6", sentenceIndex=1)),
                CompareOp(
                    op="compare",
                    targetA={"target": "Jan"},
                    targetB={"target": "Jan"},
                    groupA="rain",
                    groupB="sun",
                    field="count",
                    meta=OpsMeta(nodeId="n7", sentenceIndex=1),
                ),
                DetermineRangeOp(op="determineRange", field="count", meta=OpsMeta(nodeId="n8", sentenceIndex=1)),
            ]
        }

        draw_plan = build_draw_ops_spec(
            ops_spec=ops_spec,
            chart_context=context,
            data_rows=data_rows,
            vega_lite_spec={"mark": "bar"},
        )
        ops = draw_plan.get("ops", [])

        actions = [op.get("action") for op in ops]
        self.assertIn("band", actions)
        self.assertIn("line", actions)
        self.assertIn("text", actions)
        connect_lines = [op for op in ops if op.get("action") == "line" and op.get("line", {}).get("mode") == "connect"]
        self.assertTrue(len(connect_lines) >= 1)

    def test_builds_linear_scalar_panel_for_scalar_scalar_diff(self) -> None:
        context = ChartContext(
            fields=["Year", "Installed base in million units"],
            dimension_fields=["Year"],
            measure_fields=["Installed base in million units"],
            primary_dimension="Year",
            primary_measure="Installed base in million units",
            categorical_values={
                "Year": ["1995", "1999", "2010", "2013", "2017"],
            },
            mark="bar",
            is_stacked=False,
        )
        data_rows = [
            {"Year": "1995", "Installed base in million units": 10},
            {"Year": "1999", "Installed base in million units": 14},
            {"Year": "2010", "Installed base in million units": 20},
            {"Year": "2013", "Installed base in million units": 22},
            {"Year": "2017", "Installed base in million units": 26},
        ]
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    id="n1",
                    meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
                    field="Year",
                    include=["1995", "1999"],
                ),
                AverageOp(
                    op="average",
                    id="n2",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
                    field="Installed base in million units",
                ),
            ],
            "ops2": [
                FilterOp(
                    op="filter",
                    id="n3",
                    meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
                    field="Year",
                    include=["2010", "2013", "2017"],
                ),
                AverageOp(
                    op="average",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
                    field="Installed base in million units",
                ),
            ],
            "ops3": [
                DiffOp(
                    op="diff",
                    id="n5",
                    meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
                    field="Installed base in million units",
                    targetA="ref:n2",
                    targetB="ref:n4",
                )
            ],
        }

        scheduled = schedule_ops_spec(ops_spec)
        draw_plan = build_draw_ops_spec(
            ops_spec=scheduled,
            chart_context=context,
            data_rows=data_rows,
            vega_lite_spec={"mark": "bar"},
        )

        ops_group = draw_plan.get("ops", [])
        ops2_group = draw_plan.get("ops2", [])
        ops3_group = draw_plan.get("ops3", [])

        self.assertFalse(any(op.get("action") == "split" for op in ops_group))
        self.assertFalse(any(op.get("action") == "split" for op in ops2_group))
        self.assertFalse(any(op.get("action") == "unsplit" for op in ops3_group))
        self.assertTrue(all(op.get("chartId") is None for op in ops_group if op.get("action") != "clear"))
        self.assertTrue(all(op.get("chartId") is None for op in ops2_group))
        scalar_panels = [op for op in ops3_group if op.get("action") == "scalar-panel"]
        self.assertEqual(len(scalar_panels), 2)
        self.assertEqual(scalar_panels[0].get("scalarPanel", {}).get("mode"), "base")
        self.assertEqual(scalar_panels[1].get("scalarPanel", {}).get("mode"), "diff")
        self.assertEqual(
            scalar_panels[0].get("scalarPanel", {}).get("left", {}).get("value"),
            12.0,
        )
        self.assertEqual(
            scalar_panels[0].get("scalarPanel", {}).get("right", {}).get("value"),
            22.666666666666668,
        )

    def test_builds_linear_connect_diff_without_split_bridge(self) -> None:
        context = ChartContext(
            fields=["country", "rating"],
            dimension_fields=["country"],
            measure_fields=["rating"],
            primary_dimension="country",
            primary_measure="rating",
            categorical_values={
                "country": ["AUT", "BEL", "JPN", "KOR", "USA"],
            },
            mark="bar",
            is_stacked=False,
        )
        data_rows = [
            {"country": "AUT", "rating": 48},
            {"country": "BEL", "rating": 59},
            {"country": "JPN", "rating": 42},
            {"country": "KOR", "rating": 52},
            {"country": "USA", "rating": 53},
        ]
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    id="n1",
                    meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
                    field="country",
                    include=["JPN", "KOR"],
                ),
                AverageOp(
                    op="average",
                    id="n2",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
                    field="rating",
                ),
            ],
            "ops2": [
                FindExtremumOp(
                    op="findExtremum",
                    id="n3",
                    meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
                    field="rating",
                    which="max",
                ),
            ],
            "ops3": [
                DiffOp(
                    op="diff",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=3),
                    field="rating",
                    targetA="ref:n2",
                    targetB="ref:n3",
                )
            ],
        }
        scheduled = schedule_ops_spec(ops_spec)
        draw_plan = build_draw_ops_spec(
            ops_spec=scheduled,
            chart_context=context,
            data_rows=data_rows,
            vega_lite_spec={"mark": "bar"},
        )
        ops_group = draw_plan.get("ops", [])
        self.assertFalse(any(op.get("action") == "split" for op in ops_group))
        self.assertTrue(any(op.get("action") == "highlight" for op in ops_group))

        diff_ops = draw_plan.get("ops3", [])
        connect_ops = [
            op for op in diff_ops if op.get("action") == "line" and op.get("line", {}).get("mode") == "connect"
        ]
        self.assertEqual(len(connect_ops), 1)
        self.assertFalse(
            any(op.get("action") == "line" and op.get("line", {}).get("mode") == "connect-panel-scalar" for op in diff_ops)
        )
        delta_texts = [
            op for op in diff_ops if op.get("action") == "text" and str((op.get("text") or {}).get("value", "")).startswith("Δ")
        ]
        self.assertTrue(delta_texts)

    def test_sum_join_runs_without_unsplit_step(self) -> None:
        context = ChartContext(
            fields=["Year", "rating"],
            dimension_fields=["Year"],
            measure_fields=["rating"],
            primary_dimension="Year",
            primary_measure="rating",
            categorical_values={
                "Year": ["1995", "1999", "2010", "2013", "2017"],
            },
            mark="bar",
            is_stacked=False,
        )
        data_rows = [
            {"Year": "1995", "rating": 10},
            {"Year": "1999", "rating": 14},
            {"Year": "2010", "rating": 20},
            {"Year": "2013", "rating": 22},
            {"Year": "2017", "rating": 26},
        ]
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    id="n1",
                    meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
                    field="Year",
                    include=["1995", "1999"],
                ),
                SumOp(
                    op="sum",
                    id="n2",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
                    field="rating",
                ),
            ],
            "ops2": [
                FilterOp(
                    op="filter",
                    id="n3",
                    meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
                    field="Year",
                    include=["2010", "2013", "2017"],
                ),
                SumOp(
                    op="sum",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
                    field="rating",
                ),
            ],
            "ops3": [
                SumOp(
                    op="sum",
                    id="n5",
                    meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
                    field="rating",
                ),
            ],
        }
        scheduled = schedule_ops_spec(ops_spec)
        draw_plan = build_draw_ops_spec(
            ops_spec=scheduled,
            chart_context=context,
            data_rows=data_rows,
            vega_lite_spec={"mark": "bar"},
        )
        ops3_group = draw_plan.get("ops3", [])
        actions = [op.get("action") for op in ops3_group]
        self.assertNotIn("split", actions)
        self.assertNotIn("unsplit", actions)
        self.assertEqual(actions, ["sum", "text"])


if __name__ == "__main__":
    unittest.main()

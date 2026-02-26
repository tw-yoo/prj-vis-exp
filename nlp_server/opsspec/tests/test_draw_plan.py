from __future__ import annotations

import unittest

from draw_plan.build_draw_plan import build_draw_ops_spec
from opsspec.core.models import ChartContext
from opsspec.specs.base import OpsMeta
from opsspec.specs.filter import FilterOp
from opsspec.specs.aggregate import AverageOp


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
        self.assertTrue(any(op.get("action") == "highlight" for op in ops))
        self.assertTrue(any(op.get("action") == "stacked-filter-groups" for op in ops))


if __name__ == "__main__":
    unittest.main()


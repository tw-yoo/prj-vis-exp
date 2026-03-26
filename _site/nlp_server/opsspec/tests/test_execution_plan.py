from __future__ import annotations

import unittest

from draw_plan.build_draw_plan import build_draw_ops_spec
from opsspec.core.models import ChartContext
from opsspec.runtime.execution_plan import build_sentence_execution_plan
from opsspec.runtime.scheduler import schedule_ops_spec
from opsspec.specs.aggregate import AverageOp, SumOp
from opsspec.specs.base import OpsMeta
from opsspec.specs.compare import DiffOp
from opsspec.specs.filter import FilterOp


class ExecutionPlanTest(unittest.TestCase):
    def _context(self) -> ChartContext:
        return ChartContext(
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

    def _rows(self):
        return [
            {"Year": "1995", "Installed base in million units": 10},
            {"Year": "1999", "Installed base in million units": 14},
            {"Year": "2010", "Installed base in million units": 20},
            {"Year": "2013", "Installed base in million units": 22},
            {"Year": "2017", "Installed base in million units": 26},
        ]

    def test_builds_sentence_steps_for_linear_diff_flow(self) -> None:
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
            chart_context=self._context(),
            data_rows=self._rows(),
            vega_lite_spec={"mark": "bar"},
        )
        execution_plan = build_sentence_execution_plan(ops_spec=scheduled, draw_plan_groups=draw_plan)

        self.assertEqual(execution_plan.get("mode"), "sentence-step")
        steps = execution_plan.get("steps") or []
        self.assertEqual(len(steps), 3)
        self.assertEqual(steps[0].get("sentenceIndex"), 1)
        self.assertEqual(steps[0].get("groupNames"), ["ops"])
        self.assertEqual(steps[0].get("drawGroupNames"), ["ops"])
        self.assertIsNone(steps[0].get("splitLifecycle"))
        self.assertEqual(steps[2].get("sentenceIndex"), 3)
        self.assertEqual(steps[2].get("groupNames"), ["ops3"])
        self.assertEqual(steps[2].get("drawGroupNames"), ["ops3"])
        self.assertIsNone(steps[2].get("joinOp"))
        self.assertIsNone(steps[2].get("joinPolicy"))
        self.assertIsNone(steps[2].get("splitLifecycle"))

    def test_keeps_sentence_grouping_for_sum_flow_without_join_metadata(self) -> None:
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
                SumOp(
                    op="sum",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
                    field="Installed base in million units",
                ),
            ],
            "ops3": [
                SumOp(
                    op="sum",
                    id="n5",
                    meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
                    field="Installed base in million units",
                )
            ],
        }
        scheduled = schedule_ops_spec(ops_spec)
        execution_plan = build_sentence_execution_plan(ops_spec=scheduled, draw_plan_groups=None)
        steps = execution_plan.get("steps") or []
        self.assertEqual(len(steps), 3)
        self.assertEqual(steps[0].get("groupNames"), ["ops"])
        self.assertEqual(steps[1].get("groupNames"), ["ops2"])
        self.assertEqual(steps[2].get("groupNames"), ["ops3"])
        self.assertIsNone(steps[0].get("splitLifecycle"))
        self.assertIsNone(steps[1].get("splitLifecycle"))
        self.assertIsNone(steps[2].get("joinOp"))
        self.assertIsNone(steps[2].get("joinPolicy"))


if __name__ == "__main__":
    unittest.main()

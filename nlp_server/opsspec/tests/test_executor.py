from __future__ import annotations

import unittest

from opsspec.runtime.executor import OpsSpecExecutor
from opsspec.core.models import ChartContext
from opsspec.specs.base import OpsMeta
from opsspec.specs.filter import FilterOp
from opsspec.specs.set_op import SetOp


class ExecutorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season", "category"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"category": ["Broadcasting", "Commercial"]},
        )
        self.rows = [
            {"season": "2016/17", "category": "Broadcasting", "Revenue_Million_Euros": 220.0},
            {"season": "2017/18", "category": "Broadcasting", "Revenue_Million_Euros": 190.0},
            {"season": "2016/17", "category": "Commercial", "Revenue_Million_Euros": 300.0},
            {"season": "2017/18", "category": "Commercial", "Revenue_Million_Euros": 260.0},
        ]

    def test_setop_intersection(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops2": [
                FilterOp(
                    op="filter",
                    field="season",
                    group="Broadcasting",
                    include=["2016/17"],
                    id="a",
                    meta=OpsMeta(nodeId="n1"),
                ),
                FilterOp(
                    op="filter",
                    field="season",
                    group="Commercial",
                    include=["2016/17"],
                    id="b",
                    meta=OpsMeta(nodeId="n2"),
                )
            ],
            "ops3": [
                SetOp(op="setOp", fn="intersection", id="c", meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"]))
            ],
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        targets = [item.target for item in results["ops3"]]
        self.assertEqual(targets, ["2016/17"])


if __name__ == "__main__":
    unittest.main()

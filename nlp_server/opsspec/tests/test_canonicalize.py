from __future__ import annotations

import unittest

from opsspec.canonicalize import canonicalize_ops_spec_groups
from opsspec.models import ChartContext
from opsspec.specs.aggregate import AverageOp
from opsspec.specs.base import OpsMeta
from opsspec.specs.set_op import SetOp


class CanonicalizeTest(unittest.TestCase):
    def test_assigns_node_id_and_id_and_sorts_set_inputs(self) -> None:
        context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"category": ["Broadcasting", "Commercial"]},
        )
        groups = {
            "ops": [AverageOp(op="average", field="Revenue_Million_Euros", meta=OpsMeta(nodeId="n1"))],
            "ops2": [AverageOp(op="average", field="Revenue_Million_Euros", meta=OpsMeta(nodeId="n3"))],
            "ops3": [
                SetOp(
                    op="setOp",
                    fn="intersection",
                    meta=OpsMeta(nodeId="n2", inputs=["n3", "n1"]),
                )
            ],
        }
        normalized, warnings = canonicalize_ops_spec_groups(groups, chart_context=context)
        self.assertTrue(normalized["ops"][0].id)
        self.assertTrue(normalized["ops"][0].meta and normalized["ops"][0].meta.nodeId)
        self.assertEqual(normalized["ops3"][0].meta.inputs, ["n1", "n2"])
        self.assertIsNotNone(warnings)


if __name__ == "__main__":
    unittest.main()

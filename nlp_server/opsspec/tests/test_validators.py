from __future__ import annotations

import unittest

from opsspec.models import ChartContext
from opsspec.specs.aggregate import AverageOp
from opsspec.specs.filter import FilterOp
from opsspec.validators import validate_operation


class ValidatorsTest(unittest.TestCase):
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

    def test_filter_membership_and_comparison_conflict_raises(self) -> None:
        op = FilterOp(
            op="filter",
            field="season",
            include=["2016/17"],
            operator=">",
            value=1,
        )
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_average_defaults_to_primary_measure(self) -> None:
        op = AverageOp(op="average", field=None)
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.field, "Revenue_Million_Euros")


if __name__ == "__main__":
    unittest.main()

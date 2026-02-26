from __future__ import annotations

import unittest

from opsspec.core.models import ChartContext, PlanTree
from opsspec.validation.plan_validators import validate_plan_against_intent


class PlanValidatorsSeriesRestrictionTest(unittest.TestCase):
    def test_filter_on_series_field_is_rejected_in_module1_contract(self) -> None:
        context = ChartContext(
            fields=["Year", "Type", "Value"],
            dimension_fields=["Year", "Type"],
            measure_fields=["Value"],
            primary_dimension="Year",
            primary_measure="Value",
            series_field="Type",
            categorical_values={"Type": ["Lending", "Investment"]},
        )
        plan = PlanTree.model_validate(
            {
                "nodes": [
                    {
                        "nodeId": "n1",
                        "op": "filter",
                        "group": "ops",
                        "params": {"field": "@series_field", "include": ["Lending", "Investment"]},
                        "inputs": [],
                        "sentenceIndex": 1,
                    }
                ],
                "warnings": [],
            }
        )

        with self.assertRaises(ValueError) as ctx:
            validate_plan_against_intent(
                plan_tree=plan,
                question="Show values for Lending and Investment.",
                explanation="Look at the Lending and Investment series.",
                chart_context=context,
            )

        msg = str(ctx.exception)
        self.assertIn("Series restriction cannot be expressed as a filter on series_field", msg)
        self.assertIn('field="@series_field"', msg)


if __name__ == "__main__":
    unittest.main()


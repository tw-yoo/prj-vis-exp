from __future__ import annotations

import unittest

from opsspec.core.models import ChartContext
from opsspec.validation.endpoint_validators import validate_ops_spec_with_diagnostics


class EndpointValidatorsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season", "category"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"season": ["2016/17", "2017/18"], "category": ["Broadcasting", "Commercial"]},
            field_types={"season": "categorical", "category": "categorical", "Revenue_Million_Euros": "numeric"},
            mark="bar",
            is_stacked=False,
        )

    def test_validate_ops_spec_with_diagnostics_valid_case(self) -> None:
        raw_groups = {
            "ops": [
                {
                    "op": "filter",
                    "id": "n1",
                    "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                    "field": "season",
                    "include": ["2016/17"],
                }
            ]
        }
        report = validate_ops_spec_with_diagnostics(raw_groups, self.context)
        self.assertTrue(report["valid"])
        self.assertEqual(report["errors"], [])
        self.assertIn("ops", report["groups"])

    def test_validate_ops_spec_with_diagnostics_reports_ref_paths(self) -> None:
        raw_groups = {
            "ops": [
                {
                    "op": "average",
                    "id": "n1",
                    "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                    "field": "Revenue_Million_Euros",
                },
                {
                    "op": "diff",
                    "id": "n2",
                    "meta": {"nodeId": "n2", "inputs": ["n99"], "sentenceIndex": 1},
                    "field": "Revenue_Million_Euros",
                    "targetA": "ref:n1",
                    "targetB": "ref:n99",
                },
            ]
        }
        report = validate_ops_spec_with_diagnostics(raw_groups, self.context)
        self.assertFalse(report["valid"])
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("unknown_input_node", codes)
        self.assertIn("unknown_scalar_ref", codes)
        scalar_ref_errors = [item for item in report["errors"] if item["code"] == "unknown_scalar_ref"]
        self.assertTrue(any(item.get("path") == "targetB" for item in scalar_ref_errors))


if __name__ == "__main__":
    unittest.main()


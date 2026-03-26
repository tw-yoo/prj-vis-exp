from __future__ import annotations

import unittest

from opsspec.core.models import ChartContext
from opsspec.specs.add import AddOp
from opsspec.specs.aggregate import AverageOp, SumOp
from opsspec.specs.compare import PairDiffOp
from opsspec.specs.filter import FilterOp
from opsspec.specs.range_sort_select import FindExtremumOp
from opsspec.specs.scale import ScaleOp
from opsspec.specs.union import parse_operation_spec
from opsspec.validation.validators import validate_operation


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

    def test_filter_group_list_is_normalized_and_allowed(self) -> None:
        op = FilterOp(
            op="filter",
            field="season",
            include=["2016/17"],
            group=[" Broadcasting ", "Commercial", "Broadcasting"],
        )
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.group, ["Broadcasting", "Commercial"])

    def test_filter_group_empty_list_raises(self) -> None:
        op = FilterOp(op="filter", field="season", include=["2016/17"], group=[])
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_filter_group_list_with_empty_value_raises(self) -> None:
        op = FilterOp(op="filter", field="season", include=["2016/17"], group=["Broadcasting", ""])
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_filter_group_outside_series_domain_raises(self) -> None:
        op = FilterOp(op="filter", field="season", include=["2016/17"], group=["Broadcasting", "Unknown"])
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_filter_group_only_mode_is_allowed(self) -> None:
        op = FilterOp(op="filter", group=["Broadcasting", "Commercial"])
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.group, ["Broadcasting", "Commercial"])

    def test_filter_membership_non_primary_categorical_field_is_allowed(self) -> None:
        grouped_context = ChartContext(
            fields=["Frequency", "Race/Ethnicity", "Share of respondents"],
            dimension_fields=["Frequency", "Race/Ethnicity"],
            measure_fields=["Share of respondents"],
            primary_dimension="Race/Ethnicity",
            primary_measure="Share of respondents",
            series_field="Race/Ethnicity",
            categorical_values={
                "Frequency": [
                    "Frequently (one or more times per month)",
                    "Occasionally (less than once a month)",
                ],
                "Race/Ethnicity": ["White", "Hispanic"],
            },
            field_types={
                "Frequency": "categorical",
                "Race/Ethnicity": "categorical",
                "Share of respondents": "numeric",
            },
            mark="bar",
            is_stacked=False,
        )
        op = FilterOp(op="filter", field="Frequency", include=["Occasionally (less than once a month)"])
        normalized, _ = validate_operation(op, chart_context=grouped_context)
        self.assertEqual(normalized.field, "Frequency")

    def test_filter_membership_numeric_field_raises(self) -> None:
        op = FilterOp(op="filter", field="Revenue_Million_Euros", include=[100])
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_filter_comparison_without_field_raises(self) -> None:
        op = FilterOp(op="filter", operator=">", value=10, group="Broadcasting")
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_filter_between_on_categorical_dimension_is_allowed(self) -> None:
        op = FilterOp(op="filter", field="season", operator="between", value=["2016/17", "2017/18"])
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.operator, "between")

    def test_filter_between_requires_two_item_list(self) -> None:
        with self.assertRaises(ValueError):
            validate_operation(
                FilterOp(op="filter", field="season", operator="between", value="2016/17"),
                chart_context=self.context,
            )
        with self.assertRaises(ValueError):
            validate_operation(
                FilterOp(op="filter", field="season", operator="between", value=["2016/17"]),
                chart_context=self.context,
            )

    def test_filter_between_rejects_boundary_outside_domain(self) -> None:
        context_with_season_domain = self.context.model_copy(
            update={"categorical_values": {"category": ["Broadcasting", "Commercial"], "season": ["2016/17", "2017/18"]}}
        )
        with self.assertRaises(ValueError):
            validate_operation(
                FilterOp(op="filter", field="season", operator="between", value=["2010/11", "2017/18"]),
                chart_context=context_with_season_domain,
            )

    def test_average_defaults_to_primary_measure(self) -> None:
        op = AverageOp(op="average", field=None)
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.field, "Revenue_Million_Euros")

    def test_scale_accepts_ref_target(self) -> None:
        op = ScaleOp(op="scale", target="ref:n2", factor=2.0)
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.factor, 2.0)

    def test_scale_rejects_non_ref_string_target(self) -> None:
        op = ScaleOp(op="scale", target="n2", factor=2.0)
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_scale_parse_operation_spec(self) -> None:
        parsed = parse_operation_spec({"op": "scale", "target": "ref:n5", "factor": 2.0})
        self.assertEqual(parsed.op, "scale")

    def test_add_accepts_ref_and_numeric_literal(self) -> None:
        op = AddOp(op="add", targetA="ref:n2", targetB=3.5)
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.op, "add")

    def test_add_rejects_invalid_ref_and_non_numeric(self) -> None:
        with self.assertRaises(ValueError):
            validate_operation(AddOp(op="add", targetA="n2", targetB="ref:n3"), chart_context=self.context)
        with self.assertRaises(ValueError):
            validate_operation(AddOp(op="add", targetA="abc", targetB="ref:n3"), chart_context=self.context)

    def test_pairdiff_accepts_valid_params(self) -> None:
        op = PairDiffOp(
            op="pairDiff",
            by="season",
            field="Revenue_Million_Euros",
            groupA="Broadcasting",
            groupB="Commercial",
            signed=True,
        )
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.op, "pairDiff")

    def test_pairdiff_rejects_same_groups(self) -> None:
        op = PairDiffOp(
            op="pairDiff",
            by="season",
            field="Revenue_Million_Euros",
            groupA="Broadcasting",
            groupB="Broadcasting",
        )
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_pairdiff_parse_operation_spec(self) -> None:
        parsed = parse_operation_spec(
            {
                "op": "pairDiff",
                "by": "season",
                "field": "Revenue_Million_Euros",
                "groupA": "Broadcasting",
                "groupB": "Commercial",
            }
        )
        self.assertEqual(parsed.op, "pairDiff")

    def test_pairdiff_with_explicit_series_field_for_grouped_bar(self) -> None:
        grouped_ctx = ChartContext(
            fields=["City", "Year", "Population in millions"],
            dimension_fields=["City", "Year"],
            measure_fields=["Population in millions"],
            primary_dimension="City",
            primary_measure="Population in millions",
            series_field="Year",
            categorical_values={"City": ["Tokyo", "Delhi"], "Year": ["2010", "2025"]},
            mark="bar",
            is_stacked=False,
        )
        op = PairDiffOp(
            op="pairDiff",
            by="City",
            seriesField="Year",
            field="Population in millions",
            groupA="2025",
            groupB="2010",
        )
        normalized, _ = validate_operation(op, chart_context=grouped_ctx)
        self.assertEqual(normalized.by, "City")

    def test_pairdiff_rejects_unknown_series_field(self) -> None:
        op = PairDiffOp(
            op="pairDiff",
            by="season",
            seriesField="unknown",
            field="Revenue_Million_Euros",
            groupA="Broadcasting",
            groupB="Commercial",
        )
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_sum_requires_bar_chart(self) -> None:
        op = SumOp(op="sum", field="Revenue_Million_Euros")
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_sum_accepts_bar_chart_and_normalizes_group_list(self) -> None:
        bar_context = self.context.model_copy(update={"mark": "bar", "is_stacked": False})
        op = SumOp(op="sum", field="Revenue_Million_Euros", group=[" Broadcasting ", "Commercial", "Broadcasting"])
        normalized, _ = validate_operation(op, chart_context=bar_context)
        self.assertEqual(normalized.group, ["Broadcasting", "Commercial"])

    def test_sum_group_empty_list_raises(self) -> None:
        bar_context = self.context.model_copy(update={"mark": "bar", "is_stacked": False})
        op = SumOp(op="sum", field="Revenue_Million_Euros", group=[])
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=bar_context)

    def test_sum_group_outside_series_domain_raises(self) -> None:
        bar_context = self.context.model_copy(update={"mark": "bar", "is_stacked": True})
        op = SumOp(op="sum", field="Revenue_Million_Euros", group=["Unknown"])
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=bar_context)

    def test_find_extremum_rank_accepts_positive_int(self) -> None:
        op = FindExtremumOp(op="findExtremum", field="Revenue_Million_Euros", which="max", rank=2)
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.rank, 2)

    def test_find_extremum_rank_rejects_zero_or_negative(self) -> None:
        with self.assertRaises(ValueError):
            validate_operation(
                FindExtremumOp(op="findExtremum", field="Revenue_Million_Euros", which="max", rank=0),
                chart_context=self.context,
            )
        with self.assertRaises(ValueError):
            validate_operation(
                FindExtremumOp(op="findExtremum", field="Revenue_Million_Euros", which="min", rank=-1),
                chart_context=self.context,
            )

    def test_find_extremum_rank_rejects_non_int_type(self) -> None:
        with self.assertRaises(Exception):
            parse_operation_spec({"op": "findExtremum", "field": "Revenue_Million_Euros", "which": "max", "rank": "two"})


if __name__ == "__main__":
    unittest.main()

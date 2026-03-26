from __future__ import annotations

import unittest

from opsspec.runtime.executor import OpsSpecExecutor
from opsspec.core.models import ChartContext
from opsspec.specs.add import AddOp
from opsspec.specs.aggregate import AverageOp, SumOp
from opsspec.specs.base import OpsMeta
from opsspec.specs.compare import CompareOp, PairDiffOp
from opsspec.specs.filter import FilterOp
from opsspec.specs.range_sort_select import FindExtremumOp
from opsspec.specs.scale import ScaleOp
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

    def test_filter_group_list_uses_or_semantics(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    field="season",
                    include=["2016/17"],
                    group=["Broadcasting", "Commercial"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 2)
        self.assertEqual(sorted(item.group for item in results["ops"]), ["Broadcasting", "Commercial"])

    def test_filter_group_none_keeps_all_groups(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    field="season",
                    include=["2016/17"],
                    group=None,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 2)

    def test_filter_group_only_single_group(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    group="Broadcasting",
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 2)
        self.assertTrue(all(item.group == "Broadcasting" for item in results["ops"]))

    def test_filter_group_only_multi_group(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    group=["Broadcasting", "Commercial"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 4)

    def test_filter_membership_on_non_primary_categorical_field(self) -> None:
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
                    "Infrequently (once a year or less)",
                ],
                "Race/Ethnicity": ["White", "Hispanic"],
            },
            mark="bar",
            is_stacked=False,
        )
        grouped_rows = [
            {
                "Frequency": "Frequently (one or more times per month)",
                "Race/Ethnicity": "White",
                "Share of respondents": 0.12,
            },
            {
                "Frequency": "Occasionally (less than once a month)",
                "Race/Ethnicity": "White",
                "Share of respondents": 0.4,
            },
            {
                "Frequency": "Occasionally (less than once a month)",
                "Race/Ethnicity": "Hispanic",
                "Share of respondents": 0.43,
            },
        ]
        executor = OpsSpecExecutor(grouped_context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    field="Frequency",
                    include=["Occasionally (less than once a month)"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=grouped_rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 2)
        self.assertEqual(sorted(row.target for row in results["ops"]), ["Hispanic", "White"])

    def test_filter_between_row_order_slice(self) -> None:
        context = ChartContext(
            fields=["Year", "Population growth compared to previous year"],
            dimension_fields=["Year"],
            measure_fields=["Population growth compared to previous year"],
            primary_dimension="Year",
            primary_measure="Population growth compared to previous year",
            series_field=None,
            categorical_values={"Year": ["2009", "2010", "2011", "2012", "2013", "2014", "2015"]},
            field_types={"Year": "categorical", "Population growth compared to previous year": "numeric"},
        )
        rows = [
            {"Year": "2009", "Population growth compared to previous year": 2.76},
            {"Year": "2010", "Population growth compared to previous year": 2.76},
            {"Year": "2011", "Population growth compared to previous year": 2.76},
            {"Year": "2012", "Population growth compared to previous year": 2.76},
            {"Year": "2013", "Population growth compared to previous year": 2.76},
            {"Year": "2014", "Population growth compared to previous year": 2.75},
            {"Year": "2015", "Population growth compared to previous year": 2.73},
        ]
        executor = OpsSpecExecutor(context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    field="Year",
                    operator="between",
                    value=["2009", "2014"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=rows, ops_spec=ops_spec)
        self.assertEqual([item.target for item in results["ops"]], ["2009", "2010", "2011", "2012", "2013", "2014"])

    def test_filter_between_missing_boundary_raises(self) -> None:
        context = ChartContext(
            fields=["Year", "v"],
            dimension_fields=["Year"],
            measure_fields=["v"],
            primary_dimension="Year",
            primary_measure="v",
            series_field=None,
            categorical_values={"Year": ["2009", "2010", "2011"]},
            field_types={"Year": "categorical", "v": "numeric"},
        )
        rows = [{"Year": "2009", "v": 1.0}, {"Year": "2010", "v": 2.0}, {"Year": "2011", "v": 3.0}]
        executor = OpsSpecExecutor(context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    field="Year",
                    operator="between",
                    value=["2009", "2014"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        with self.assertRaises(ValueError):
            executor.execute(rows=rows, ops_spec=ops_spec)

    def test_find_extremum_with_rank_second_max(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FindExtremumOp(
                    op="findExtremum",
                    field="Revenue_Million_Euros",
                    which="max",
                    rank=2,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 1)
        self.assertEqual(results["ops"][0].value, 260.0)

    def test_find_extremum_with_rank_second_min(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FindExtremumOp(
                    op="findExtremum",
                    field="Revenue_Million_Euros",
                    which="min",
                    rank=2,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 1)
        self.assertEqual(results["ops"][0].value, 220.0)

    def test_find_extremum_rank_out_of_range_raises(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FindExtremumOp(
                    op="findExtremum",
                    field="Revenue_Million_Euros",
                    which="max",
                    rank=5,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        with self.assertRaises(ValueError):
            executor.execute(rows=self.rows, ops_spec=ops_spec)

    def test_find_extremum_rank_tie_row_order(self) -> None:
        context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season", "category"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"category": ["A", "B"]},
        )
        rows = [
            {"season": "s1", "category": "A", "Revenue_Million_Euros": 10.0},
            {"season": "s2", "category": "A", "Revenue_Million_Euros": 10.0},
            {"season": "s3", "category": "A", "Revenue_Million_Euros": 8.0},
        ]
        executor = OpsSpecExecutor(context)
        ops_spec = {
            "ops": [
                FindExtremumOp(
                    op="findExtremum",
                    field="Revenue_Million_Euros",
                    which="max",
                    rank=2,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"][0].target, "s1")

    def test_scale_and_compare_on_scalar_refs(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                FilterOp(
                    op="filter",
                    field="season",
                    include=["2016/17", "2017/18"],
                    group="Broadcasting",
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ],
            "ops2": [
                AverageOp(
                    op="average",
                    field="Revenue_Million_Euros",
                    id="n2",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"]),
                )
            ],
            "ops3": [
                FilterOp(
                    op="filter",
                    field="season",
                    include=["2016/17", "2017/18"],
                    group="Commercial",
                    id="n3",
                    meta=OpsMeta(nodeId="n3"),
                )
            ],
            "ops4": [
                AverageOp(
                    op="average",
                    field="Revenue_Million_Euros",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n3"]),
                )
            ],
            "ops5": [
                CompareOp(
                    op="compare",
                    field="Revenue_Million_Euros",
                    targetA="ref:n2",
                    targetB="ref:n4",
                    which="min",
                    id="n5",
                    meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"]),
                ),
                ScaleOp(
                    op="scale",
                    target="ref:n5",
                    factor=2.0,
                    field="Revenue_Million_Euros",
                    id="n6",
                    meta=OpsMeta(nodeId="n6", inputs=["n5"]),
                ),
            ],
            "ops6": [
                CompareOp(
                    op="compare",
                    field="Revenue_Million_Euros",
                    targetA="ref:n2",
                    targetB="ref:n4",
                    which="max",
                    id="n7",
                    meta=OpsMeta(nodeId="n7", inputs=["n2", "n4"]),
                ),
                CompareOp(
                    op="compare",
                    field="Revenue_Million_Euros",
                    targetA="ref:n6",
                    targetB="ref:n7",
                    which="max",
                    id="n8",
                    meta=OpsMeta(nodeId="n8", inputs=["n6", "n7"]),
                ),
            ],
        }

        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        final_value = results["ops6"][-1].value
        # Broadcasting avg=205, Commercial avg=280 -> min=205 -> doubled=410 -> max(410,280)=410
        self.assertEqual(final_value, 410.0)

    def test_add_scalar_refs(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                SumOp(
                    op="sum",
                    field="Revenue_Million_Euros",
                    group="Broadcasting",
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                ),
                SumOp(
                    op="sum",
                    field="Revenue_Million_Euros",
                    group="Commercial",
                    id="n2",
                    meta=OpsMeta(nodeId="n2"),
                ),
            ],
            "ops2": [
                AddOp(
                    op="add",
                    targetA="ref:n1",
                    targetB="ref:n2",
                    field="Revenue_Million_Euros",
                    id="n3",
                    meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"]),
                )
            ],
        }
        bar_context = self.context.model_copy(update={"mark": "bar", "is_stacked": False})
        executor = OpsSpecExecutor(bar_context)
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops2"][-1].value, 970.0)

    def test_add_literal_and_ref(self) -> None:
        bar_context = self.context.model_copy(update={"mark": "bar", "is_stacked": False})
        executor = OpsSpecExecutor(bar_context)
        ops_spec = {
            "ops": [
                SumOp(
                    op="sum",
                    field="Revenue_Million_Euros",
                    group="Broadcasting",
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                ),
            ],
            "ops2": [
                AddOp(
                    op="add",
                    targetA="ref:n1",
                    targetB=10.0,
                    field="Revenue_Million_Euros",
                    id="n2",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"]),
                )
            ],
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops2"][-1].value, 420.0)

    def test_add_unknown_ref_returns_empty(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                AddOp(
                    op="add",
                    targetA="ref:n999",
                    targetB=1.0,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"], [])

    def test_pairdiff_returns_per_target_rows(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops": [
                PairDiffOp(
                    op="pairDiff",
                    by="season",
                    field="Revenue_Million_Euros",
                    groupA="Broadcasting",
                    groupB="Commercial",
                    signed=True,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(len(results["ops"]), 2)
        values_by_target = {row.target: row.value for row in results["ops"]}
        self.assertAlmostEqual(values_by_target["2016/17"], 220.0 - 300.0)
        self.assertAlmostEqual(values_by_target["2017/18"], 190.0 - 260.0)

    def test_pairdiff_grouped_bar_city_wise(self) -> None:
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
        grouped_rows = [
            {"City": "Tokyo", "Year": "2025", "Population in millions": 37.1},
            {"City": "Tokyo", "Year": "2010", "Population in millions": 36.7},
            {"City": "Delhi", "Year": "2025", "Population in millions": 28.6},
            {"City": "Delhi", "Year": "2010", "Population in millions": 22.2},
        ]
        executor = OpsSpecExecutor(grouped_ctx)
        ops_spec = {
            "ops": [
                PairDiffOp(
                    op="pairDiff",
                    by="City",
                    seriesField="Year",
                    field="Population in millions",
                    groupA="2025",
                    groupB="2010",
                    signed=True,
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=grouped_rows, ops_spec=ops_spec)
        values_by_city = {row.target: row.value for row in results["ops"]}
        self.assertAlmostEqual(values_by_city["Tokyo"], 0.4)
        self.assertAlmostEqual(values_by_city["Delhi"], 6.4)

    def test_sum_simple_bar_with_single_group(self) -> None:
        simple_context = self.context.model_copy(update={"mark": "bar", "is_stacked": False})
        executor = OpsSpecExecutor(simple_context)
        ops_spec = {
            "ops": [
                SumOp(
                    op="sum",
                    field="Revenue_Million_Euros",
                    group="Broadcasting",
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"][-1].value, 410.0)

    def test_sum_simple_bar_without_group(self) -> None:
        simple_context = self.context.model_copy(update={"mark": "bar", "is_stacked": False})
        executor = OpsSpecExecutor(simple_context)
        ops_spec = {"ops": [SumOp(op="sum", field="Revenue_Million_Euros", id="n1", meta=OpsMeta(nodeId="n1"))]}
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"][-1].value, 970.0)

    def test_sum_stacked_bar_without_group_sums_all(self) -> None:
        stacked_context = self.context.model_copy(update={"mark": "bar", "is_stacked": True})
        executor = OpsSpecExecutor(stacked_context)
        ops_spec = {"ops": [SumOp(op="sum", field="Revenue_Million_Euros", id="n1", meta=OpsMeta(nodeId="n1"))]}
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"][-1].value, 970.0)

    def test_sum_stacked_bar_with_multi_group_sums_all(self) -> None:
        stacked_context = self.context.model_copy(update={"mark": "bar", "is_stacked": True})
        executor = OpsSpecExecutor(stacked_context)
        ops_spec = {
            "ops": [
                SumOp(
                    op="sum",
                    field="Revenue_Million_Euros",
                    group=["Broadcasting", "Commercial"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"][-1].value, 970.0)

    def test_sum_stacked_bar_with_single_group_sums_that_group(self) -> None:
        stacked_context = self.context.model_copy(update={"mark": "bar", "is_stacked": True})
        executor = OpsSpecExecutor(stacked_context)
        ops_spec = {
            "ops": [
                SumOp(
                    op="sum",
                    field="Revenue_Million_Euros",
                    group=["Broadcasting"],
                    id="n1",
                    meta=OpsMeta(nodeId="n1"),
                )
            ]
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        self.assertEqual(results["ops"][-1].value, 410.0)


if __name__ == "__main__":
    unittest.main()

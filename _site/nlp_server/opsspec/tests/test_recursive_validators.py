from __future__ import annotations

import unittest

from opsspec.core.models import ChartContext
from opsspec.core.recursive_models import OpTask
from opsspec.specs.aggregate import AverageOp
from opsspec.runtime.op_registry import build_ops_contract_for_prompt
from opsspec.validation.validators import validate_operation
from opsspec.validation.recursive_validators import validate_inventory, validate_step_compose_output


class RecursiveValidatorsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.chart_context = ChartContext(
            fields=["season", "category", "value"],
            dimension_fields=["season", "category"],
            measure_fields=["value"],
            primary_dimension="season",
            primary_measure="value",
            series_field="category",
            categorical_values={
                "season": ["2016/17", "2017/18"],
                "category": ["Broadcasting", "Commercial"],
            },
        )
        self.ops_contract = build_ops_contract_for_prompt()

    def test_inventory_drops_series_field_filter_task(self) -> None:
        payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "keep only Broadcasting",
                    "paramsHint": {"field": "@series_field", "include": ["Broadcasting"]},
                },
                {
                    "taskId": "o2",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average value",
                    "paramsHint": {"field": "@primary_measure", "group": "Broadcasting"},
                },
            ],
            "warnings": [],
        }
        validated = validate_inventory(
            payload,
            ops_contract=self.ops_contract,
            chart_context=self.chart_context,
        )
        self.assertEqual(len(validated.tasks), 1)
        self.assertEqual(validated.tasks[0].taskId, "o2")
        self.assertTrue(any("ignored filter on series_field" in warning for warning in validated.warnings))

    def test_step_compose_rejects_object_ref(self) -> None:
        payload = {
            "pickTaskId": "o1",
            "op_spec": {
                "op": "filter",
                "field": "@primary_measure",
                "operator": ">",
                "value": {"id": "n1"},
            },
            "inputs": ["n1"],
        }
        remaining = {
            "o1": OpTask(
                taskId="o1",
                op="filter",
                sentenceIndex=1,
                mention="value above previous average",
                paramsHint={"field": "@primary_measure", "operator": ">", "value": "ref:n1"},
            )
        }
        with self.assertRaisesRegex(ValueError, "Object reference"):
            validate_step_compose_output(
                payload,
                selected_task=remaining["o1"],
                executed_node_ids={"n1"},
                ops_contract=self.ops_contract,
                chart_context=self.chart_context,
            )

    def test_step_compose_rejects_incomplete_filter_mode(self) -> None:
        payload = {
            "pickTaskId": "o1",
            "op_spec": {
                "op": "filter",
                "field": "@primary_measure",
                "operator": ">",
            },
            "inputs": ["n1"],
        }
        remaining = {
            "o1": OpTask(
                taskId="o1",
                op="filter",
                sentenceIndex=1,
                mention="value above previous average",
                paramsHint={"field": "@primary_measure", "operator": ">", "value": "ref:n1"},
            )
        }
        with self.assertRaisesRegex(ValueError, "requires both operator and value"):
            validate_step_compose_output(
                payload,
                selected_task=remaining["o1"],
                executed_node_ids={"n1"},
                ops_contract=self.ops_contract,
                chart_context=self.chart_context,
            )

    def test_step_compose_uses_selected_task_not_pick_task_id(self) -> None:
        payload = {
            "pickTaskId": "o999",
            "op_spec": {"op": "average", "field": "@primary_measure"},
            "inputs": [],
        }
        selected = OpTask(
            taskId="o2",
            op="average",
            sentenceIndex=1,
            mention="average value",
            paramsHint={"field": "@primary_measure"},
        )
        parsed = validate_step_compose_output(
            payload,
            selected_task=selected,
            executed_node_ids=set(),
            ops_contract=self.ops_contract,
            chart_context=self.chart_context,
        )
        self.assertEqual(parsed.op_spec.get("op"), "average")

    def test_step_compose_rejects_op_mismatch_against_selected_task(self) -> None:
        payload = {
            "pickTaskId": "o1",
            "op_spec": {"op": "filter", "field": "@primary_measure", "operator": ">", "value": 0},
            "inputs": [],
        }
        selected = OpTask(
            taskId="o2",
            op="average",
            sentenceIndex=1,
            mention="average value",
            paramsHint={"field": "@primary_measure"},
        )
        with self.assertRaisesRegex(ValueError, 'must match task.op "average"'):
            validate_step_compose_output(
                payload,
                selected_task=selected,
                executed_node_ids=set(),
                ops_contract=self.ops_contract,
                chart_context=self.chart_context,
            )

    def test_step_compose_rejects_average_group_list_with_guidance(self) -> None:
        payload = {
            "op_spec": {
                "op": "average",
                "field": "@primary_measure",
                "group": ["2010", "2013", "2017"],
            },
            "inputs": ["n3"],
        }
        selected = OpTask(
            taskId="o4",
            op="average",
            sentenceIndex=2,
            mention="average for selected years",
            paramsHint={"field": "@primary_measure"},
        )
        with self.assertRaisesRegex(ValueError, "single series value string"):
            validate_step_compose_output(
                payload,
                selected_task=selected,
                executed_node_ids={"n3"},
                ops_contract=self.ops_contract,
                chart_context=self.chart_context,
            )

    def test_step_compose_rejects_average_group_when_series_field_missing(self) -> None:
        context_without_series = ChartContext(
            fields=["year", "value"],
            dimension_fields=["year"],
            measure_fields=["value"],
            primary_dimension="year",
            primary_measure="value",
            series_field=None,
            categorical_values={"year": ["2010", "2013", "2017"]},
        )
        payload = {
            "op_spec": {"op": "average", "field": "value", "group": "Commercial"},
            "inputs": ["n3"],
        }
        selected = OpTask(
            taskId="o4",
            op="average",
            sentenceIndex=2,
            mention="average for selected years",
            paramsHint={"field": "value"},
        )
        with self.assertRaisesRegex(ValueError, "series_field is empty"):
            validate_step_compose_output(
                payload,
                selected_task=selected,
                executed_node_ids={"n3"},
                ops_contract=self.ops_contract,
                chart_context=context_without_series,
            )

    def test_step_compose_rejects_sentence_layer_group_token(self) -> None:
        payload = {
            "op_spec": {"op": "average", "field": "@primary_measure", "group": "ops2"},
            "inputs": ["n3"],
        }
        selected = OpTask(
            taskId="o4",
            op="average",
            sentenceIndex=2,
            mention="average for selected years",
            paramsHint={"field": "@primary_measure"},
        )
        with self.assertRaisesRegex(ValueError, "sentence-layer tokens"):
            validate_step_compose_output(
                payload,
                selected_task=selected,
                executed_node_ids={"n3"},
                ops_contract=self.ops_contract,
                chart_context=self.chart_context,
            )

    def test_validate_operation_rejects_average_group_without_series_field(self) -> None:
        context_without_series = ChartContext(
            fields=["year", "value"],
            dimension_fields=["year"],
            measure_fields=["value"],
            primary_dimension="year",
            primary_measure="value",
            series_field=None,
            categorical_values={"year": ["2010", "2013", "2017"]},
        )
        with self.assertRaisesRegex(ValueError, "series_field is empty"):
            validate_operation(
                AverageOp(field="value", group="Commercial"),
                chart_context=context_without_series,
            )

    def test_validate_operation_rejects_sentence_layer_group_token(self) -> None:
        with self.assertRaisesRegex(ValueError, "sentence-layer tokens"):
            validate_operation(
                AverageOp(field="value", group="ops2"),
                chart_context=self.chart_context,
            )


if __name__ == "__main__":
    unittest.main()

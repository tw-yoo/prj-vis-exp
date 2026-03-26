from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from opsspec.core.models import ChartContext
from opsspec.core.recursive_models import OpTask
from opsspec.modules.pipeline import (
    OpsSpecPipeline,
    _build_human_abstracted_ops_spec,
    _persist_debug_bundle,
    _select_next_task,
)


class RecursivePipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.prompts_dir = Path(__file__).resolve().parents[2] / "prompts"
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
        self.rows_preview = self.rows[:2]

    def _pipeline(self) -> OpsSpecPipeline:
        return OpsSpecPipeline(
            ollama_model="test",
            ollama_base_url="http://localhost:11434/v1",
            ollama_api_key="test",
            prompts_dir=self.prompts_dir,
        )

    def test_select_next_task_prefers_ready_task_with_min_id(self) -> None:
        remaining = {
            "o1": OpTask(
                taskId="o1",
                op="diff",
                sentenceIndex=1,
                mention="diff from ref",
                paramsHint={"targetA": "ref:n9", "targetB": 1},
            ),
            "o2": OpTask(
                taskId="o2",
                op="average",
                sentenceIndex=1,
                mention="average",
                paramsHint={"field": "@primary_measure"},
            ),
            "o3": OpTask(
                taskId="o3",
                op="count",
                sentenceIndex=1,
                mention="count",
                paramsHint={},
            ),
        }
        selected, warnings = _select_next_task(remaining, executed_node_ids={"n1"})
        self.assertEqual(str(selected.taskId), "o2")
        self.assertEqual(warnings, [])

    def test_select_next_task_falls_back_when_no_ready_task(self) -> None:
        remaining = {
            "o2": OpTask(
                taskId="o2",
                op="diff",
                sentenceIndex=1,
                mention="diff",
                paramsHint={"targetA": "ref:n7", "targetB": "ref:n8"},
            ),
            "o3": OpTask(
                taskId="o3",
                op="add",
                sentenceIndex=1,
                mention="add",
                paramsHint={"targetA": "ref:n9", "targetB": 1},
            ),
        }
        selected, warnings = _select_next_task(remaining, executed_node_ids=set())
        self.assertEqual(str(selected.taskId), "o2")
        self.assertTrue(any("fallback" in warning for warning in warnings))

    def test_build_human_abstracted_ops_spec_strips_debug_fields(self) -> None:
        ops_spec = {
            "ops": [
                {
                    "op": "filter",
                    "id": "n1",
                    "chartId": "chart-a",
                    "meta": {
                        "nodeId": "n1",
                        "inputs": [],
                        "sentenceIndex": 1,
                        "source": "recursive_step=1;taskId=o1",
                        "view": {"phase": 1},
                    },
                    "field": "Year",
                    "operator": ">",
                    "value": 2010,
                    "precision": None,
                }
            ],
            "ops2": [
                {
                    "op": "diff",
                    "id": "n2",
                    "meta": {
                        "nodeId": "n2",
                        "inputs": ["n1"],
                        "sentenceIndex": 2,
                        "source": "recursive_step=2;taskId=o2",
                        "view": {"phase": 2},
                    },
                    "field": "Revenue_Million_Euros",
                    "targetA": "ref:n1",
                    "targetB": 100,
                    "signed": False,
                }
            ],
        }

        abstracted = _build_human_abstracted_ops_spec(ops_spec)

        self.assertEqual(list(abstracted.keys()), ["ops", "ops2"])
        self.assertEqual(abstracted["ops"][0]["id"], "n1")
        self.assertEqual(abstracted["ops"][0]["meta"]["nodeId"], "n1")
        self.assertEqual(abstracted["ops"][0]["meta"]["inputs"], [])
        self.assertEqual(abstracted["ops"][0]["meta"]["sentenceIndex"], 1)
        self.assertNotIn("chartId", abstracted["ops"][0])
        self.assertNotIn("source", abstracted["ops"][0]["meta"])
        self.assertNotIn("view", abstracted["ops"][0]["meta"])
        self.assertNotIn("precision", abstracted["ops"][0])
        self.assertEqual(abstracted["ops"][0]["field"], "Year")
        self.assertEqual(abstracted["ops"][0]["operator"], ">")
        self.assertEqual(abstracted["ops"][0]["value"], 2010)

        self.assertEqual(abstracted["ops2"][0]["id"], "n2")
        self.assertEqual(abstracted["ops2"][0]["meta"]["nodeId"], "n2")
        self.assertEqual(abstracted["ops2"][0]["meta"]["inputs"], ["n1"])
        self.assertEqual(abstracted["ops2"][0]["meta"]["sentenceIndex"], 2)
        self.assertEqual(abstracted["ops2"][0]["targetA"], "ref:n1")
        self.assertEqual(abstracted["ops2"][0]["targetB"], 100)
        self.assertFalse(abstracted["ops2"][0]["signed"])

    def test_persist_debug_bundle_writes_human_abstracted_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / "session"
            session_dir.mkdir(parents=True, exist_ok=True)
            payloads = {
                "human_abstracted_ops_spec": {
                    "ops": [
                        {
                            "op": "average",
                            "id": "n1",
                            "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                            "field": "Revenue_Million_Euros",
                        }
                    ]
                }
            }

            with patch("opsspec.modules.pipeline._create_debug_session_dir", return_value=session_dir):
                out_dir = _persist_debug_bundle(payloads)

            self.assertEqual(out_dir, session_dir)
            out_file = session_dir / "92_human_abstracted_ops_spec.json"
            self.assertTrue(out_file.exists())
            text = out_file.read_text(encoding="utf-8")
            self.assertIn('"meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }', text)
            parsed = json.loads(text)
            self.assertEqual(parsed, payloads["human_abstracted_ops_spec"])

    def test_recursive_chain_with_scalar_ref(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue for Broadcasting",
                    "paramsHint": {"field": "@primary_measure", "group": "Broadcasting"},
                },
                {
                    "taskId": "o2",
                    "op": "filter",
                    "sentenceIndex": 2,
                    "mention": "revenue greater than that average (Broadcasting)",
                    "paramsHint": {"field": "@primary_measure", "operator": ">", "value": "ref:n1", "group": "Broadcasting"},
                },
                {
                    "taskId": "o3",
                    "op": "findExtremum",
                    "sentenceIndex": 2,
                    "mention": "pick the maximum season",
                    "paramsHint": {"which": "max", "field": "@primary_measure"},
                },
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure", "group": "Broadcasting"}, "inputs": []},
            {
                "pickTaskId": "o2",
                "op_spec": {
                    "op": "filter",
                    "field": "@primary_measure",
                    "operator": ">",
                    "value": "ref:n1",
                    "group": "Broadcasting",
                },
                "inputs": [],
            },
            {"pickTaskId": "o3", "op_spec": {"op": "findExtremum", "which": "max", "field": "@primary_measure"}, "inputs": ["n2"]},
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertIn("ops2", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        self.assertEqual(len(result.ops_spec["ops2"]), 2)

        op1 = result.ops_spec["ops"][0]
        op2 = result.ops_spec["ops2"][0]
        op3 = result.ops_spec["ops2"][1]

        self.assertEqual(op1.meta.nodeId, "n1")
        self.assertEqual(op2.meta.nodeId, "n2")
        self.assertEqual(op3.meta.nodeId, "n3")

        self.assertEqual(op1.id, "n1")
        self.assertEqual(op2.id, "n2")
        self.assertEqual(op3.id, "n3")

        self.assertEqual(op1.meta.inputs, [])
        self.assertEqual(op2.meta.inputs, ["n1"])
        self.assertEqual(op3.meta.inputs, ["n2"])

        op2_dump = op2.model_dump(by_alias=True, exclude_none=True)
        self.assertEqual(op2_dump.get("value"), "ref:n1")
        self.assertNotIsInstance(op2_dump.get("value"), dict)

        self.assertEqual(op1.meta.sentenceIndex, 1)
        self.assertEqual(op2.meta.sentenceIndex, 2)
        self.assertEqual(op3.meta.sentenceIndex, 2)
        self.assertTrue(str(op1.meta.source).startswith("recursive_step=1;"))
        self.assertTrue(str(op2.meta.source).startswith("recursive_step=2;"))
        self.assertTrue(str(op3.meta.source).startswith("recursive_step=3;"))

    def test_generate_includes_human_abstracted_payload_for_debug_bundle(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue for Broadcasting",
                    "paramsHint": {"field": "@primary_measure", "group": "Broadcasting"},
                },
                {
                    "taskId": "o2",
                    "op": "filter",
                    "sentenceIndex": 2,
                    "mention": "revenue greater than average",
                    "paramsHint": {"field": "@primary_measure", "operator": ">", "value": "ref:n1"},
                },
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure", "group": "Broadcasting"}, "inputs": []},
            {"pickTaskId": "o2", "op_spec": {"op": "filter", "field": "@primary_measure", "operator": ">", "value": "ref:n1"}, "inputs": ["n1"]},
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")) as persist_debug,
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertTrue(persist_debug.called)
        payload = persist_debug.call_args.args[0]
        self.assertIn("human_abstracted_ops_spec", payload)

        expected = _build_human_abstracted_ops_spec(payload["final_grammar"]["ops_spec"])
        self.assertEqual(payload["human_abstracted_ops_spec"], expected)
        self.assertEqual(list(payload["human_abstracted_ops_spec"].keys()), list(result.ops_spec.keys()))
        self.assertEqual(len(payload["human_abstracted_ops_spec"]["ops"]), len(result.ops_spec["ops"]))
        self.assertEqual(len(payload["human_abstracted_ops_spec"]["ops2"]), len(result.ops_spec["ops2"]))

    def test_find_extremum_with_rank_is_parsed_and_executed(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "findExtremum",
                    "sentenceIndex": 1,
                    "mention": "find second highest",
                    "paramsHint": {"which": "max", "rank": 2, "field": "@primary_measure"},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {"op": "findExtremum", "which": "max", "rank": 2, "field": "@primary_measure"},
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.op, "findExtremum")
        self.assertEqual(op.rank, 2)

    def test_setop_requires_two_inputs(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "Broadcasting in 2016/17",
                    "paramsHint": {"field": "@primary_dimension", "include": ["2016/17"], "group": "Broadcasting"},
                },
                {
                    "taskId": "o2",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "Commercial in 2016/17",
                    "paramsHint": {"field": "@primary_dimension", "include": ["2016/17"], "group": "Commercial"},
                },
                {
                    "taskId": "o3",
                    "op": "setOp",
                    "sentenceIndex": 2,
                    "mention": "intersection of those seasons",
                    "paramsHint": {"fn": "intersection"},
                },
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {"op": "filter", "field": "@primary_dimension", "include": ["2016/17"], "group": "Broadcasting"},
                "inputs": [],
            },
            {
                "pickTaskId": "o2",
                "op_spec": {"op": "filter", "field": "@primary_dimension", "include": ["2016/17"], "group": "Commercial"},
                "inputs": [],
            },
            {
                "pickTaskId": "o3",
                "op_spec": {"op": "setOp", "fn": "intersection"},
                "inputs": ["n1", "n2"],
            },
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertIn("ops2", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 2)
        self.assertEqual(len(result.ops_spec["ops2"]), 1)

        set_op = result.ops_spec["ops2"][0]
        self.assertEqual(set_op.op, "setOp")
        self.assertEqual(set_op.meta.nodeId, "n3")
        self.assertEqual(set(set_op.meta.inputs or []), {"n1", "n2"})

    def test_step_compose_strict_retry(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue",
                    "paramsHint": {"field": "@primary_measure"},
                }
            ],
            "warnings": [],
        }
        invalid = {"pickTaskId": "o1", "op_spec": {"op": "average", "id": "oops"}, "inputs": []}
        valid = {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure"}, "inputs": []}

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=[invalid, valid]) as step_compose,
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertEqual(step_compose.call_count, 2)
        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        self.assertEqual(result.ops_spec["ops"][0].meta.nodeId, "n1")
        self.assertTrue(any("step 1 attempt 1" in w for w in result.warnings))

    def test_step_compose_retry_on_average_group_misuse_then_recovers(self) -> None:
        context = ChartContext(
            fields=["Year", "Installed base in million units"],
            dimension_fields=["Year"],
            measure_fields=["Installed base in million units"],
            primary_dimension="Year",
            primary_measure="Installed base in million units",
            series_field=None,
            categorical_values={"Year": ["1995", "1999", "2010", "2013", "2017"]},
            mark="bar",
            is_stacked=False,
        )
        rows = [
            {"Year": "1995", "Installed base in million units": 64.0},
            {"Year": "1999", "Installed base in million units": 54.0},
            {"Year": "2010", "Installed base in million units": 109.0},
            {"Year": "2013", "Installed base in million units": 128.0},
            {"Year": "2017", "Installed base in million units": 105.0},
        ]
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "filter 1995 and 1999",
                    "paramsHint": {"field": "Year", "include": ["1995", "1999"]},
                },
                {
                    "taskId": "o2",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average 1995 and 1999",
                    "paramsHint": {"field": "Installed base in million units"},
                },
                {
                    "taskId": "o3",
                    "op": "filter",
                    "sentenceIndex": 2,
                    "mention": "filter 2010 2013 2017",
                    "paramsHint": {"field": "Year", "include": ["2010", "2013", "2017"]},
                },
                {
                    "taskId": "o4",
                    "op": "average",
                    "sentenceIndex": 2,
                    "mention": "average 2010 2013 2017",
                    "paramsHint": {"field": "Installed base in million units"},
                },
                {
                    "taskId": "o5",
                    "op": "diff",
                    "sentenceIndex": 3,
                    "mention": "difference between two averages",
                    "paramsHint": {"targetA": "ref:n2", "targetB": "ref:n4", "signed": False},
                },
            ],
            "warnings": [],
        }
        step_payloads = [
            {"op_spec": {"op": "filter", "field": "Year", "include": ["1995", "1999"]}, "inputs": []},
            {"op_spec": {"op": "average", "field": "Installed base in million units"}, "inputs": ["n1"]},
            {"op_spec": {"op": "filter", "field": "Year", "include": ["2010", "2013", "2017"]}, "inputs": []},
            {
                "op_spec": {
                    "op": "average",
                    "field": "Installed base in million units",
                    "group": ["2010", "2013", "2017"],
                },
                "inputs": ["n3"],
            },
            {"op_spec": {"op": "average", "field": "Installed base in million units"}, "inputs": ["n3"]},
            {
                "op_spec": {
                    "op": "diff",
                    "field": "Installed base in million units",
                    "targetA": "ref:n2",
                    "targetB": "ref:n4",
                    "signed": False,
                },
                "inputs": ["n2", "n4"],
            },
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(context, [], rows[:2])),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads) as step_compose,
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={"mark": "bar"},
                data_rows=rows,
                request_id="req",
                debug=False,
            )

        self.assertEqual(step_compose.call_count, 6)
        self.assertIn("ops3", result.ops_spec)
        self.assertEqual(result.ops_spec["ops2"][1].op, "average")
        self.assertEqual(result.ops_spec["ops2"][1].meta.inputs, ["n3"])
        self.assertTrue(any("step 4 attempt 1" in warning for warning in result.warnings))

    def test_filter_group_list_is_grounded_and_executed(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "keep 2016/17 for broadcasting and commercial",
                    "paramsHint": {"field": "@primary_dimension", "include": ["2016/17"], "group": ["broadcasting", "commercial"]},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {"op": "filter", "field": "@primary_dimension", "include": ["2016/17"], "group": ["broadcasting", "commercial"]},
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.group, ["Broadcasting", "Commercial"])

    def test_filter_between_is_parsed_and_executed(self) -> None:
        context = ChartContext(
            fields=["Year", "Population growth compared to previous year"],
            dimension_fields=["Year"],
            measure_fields=["Population growth compared to previous year"],
            primary_dimension="Year",
            primary_measure="Population growth compared to previous year",
            series_field=None,
            categorical_values={"Year": ["2009", "2010", "2011", "2012", "2013", "2014", "2015"]},
            field_types={"Year": "categorical", "Population growth compared to previous year": "numeric"},
            mark="bar",
            is_stacked=False,
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
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "from 2009 to 2014",
                    "paramsHint": {"field": "Year", "operator": "between", "value": ["2009", "2014"]},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {"op": "filter", "field": "Year", "operator": "between", "value": ["2009", "2014"]},
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(context, [], rows[:2])),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.op, "filter")
        self.assertEqual(op.operator, "between")

    def test_add_step_is_parsed_and_emitted(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average for broadcasting",
                    "paramsHint": {"field": "@primary_measure", "group": "Broadcasting"},
                },
                {
                    "taskId": "o2",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average for commercial",
                    "paramsHint": {"field": "@primary_measure", "group": "Commercial"},
                },
                {
                    "taskId": "o3",
                    "op": "add",
                    "sentenceIndex": 2,
                    "mention": "add those two averages",
                    "paramsHint": {"targetA": "ref:n1", "targetB": "ref:n2"},
                },
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure", "group": "Broadcasting"}, "inputs": []},
            {"pickTaskId": "o2", "op_spec": {"op": "average", "field": "@primary_measure", "group": "Commercial"}, "inputs": []},
            {"pickTaskId": "o3", "op_spec": {"op": "add", "targetA": "ref:n1", "targetB": "ref:n2"}, "inputs": ["n1", "n2"]},
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops2", result.ops_spec)
        self.assertEqual(result.ops_spec["ops2"][-1].op, "add")

    def test_pairdiff_step_is_parsed_and_emitted(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "pairDiff",
                    "sentenceIndex": 1,
                    "mention": "compute per-season difference between broadcasting and commercial",
                    "paramsHint": {
                        "by": "@primary_dimension",
                        "field": "@primary_measure",
                        "groupA": "Broadcasting",
                        "groupB": "Commercial",
                    },
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {
                    "op": "pairDiff",
                    "by": "@primary_dimension",
                    "field": "@primary_measure",
                    "groupA": "Broadcasting",
                    "groupB": "Commercial",
                },
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.op, "pairDiff")
        self.assertEqual(op.by, "season")

    def test_pairdiff_grouped_bar_with_explicit_series_field(self) -> None:
        grouped_context = ChartContext(
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
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "pairDiff",
                    "sentenceIndex": 1,
                    "mention": "city-wise 2025 minus 2010",
                    "paramsHint": {
                        "by": "City",
                        "seriesField": "Year",
                        "field": "Population in millions",
                        "groupA": "2025",
                        "groupB": "2010",
                    },
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {
                    "op": "pairDiff",
                    "by": "City",
                    "seriesField": "Year",
                    "field": "Population in millions",
                    "groupA": "2025",
                    "groupB": "2010",
                },
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(grouped_context, [], grouped_rows[:2])),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=grouped_rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.op, "pairDiff")
        self.assertEqual(op.by, "City")
        self.assertEqual(op.seriesField, "Year")

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
                "Share of respondents": 0.40,
            },
            {
                "Frequency": "Occasionally (less than once a month)",
                "Race/Ethnicity": "Hispanic",
                "Share of respondents": 0.43,
            },
        ]
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "keep occasionally frequency",
                    "paramsHint": {"field": "Frequency", "include": ["Occasionally (less than once a month)"]},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {"op": "filter", "field": "Frequency", "include": ["Occasionally (less than once a month)"]},
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(grouped_context, [], grouped_rows[:2])),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=grouped_rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.op, "filter")
        self.assertEqual(op.field, "Frequency")

    def test_filter_group_only_step_is_allowed(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "keep only broadcasting and commercial series",
                    "paramsHint": {"group": ["broadcasting", "commercial"]},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {
                "pickTaskId": "o1",
                "op_spec": {"op": "filter", "group": ["broadcasting", "commercial"]},
                "inputs": [],
            }
        ]

        with (
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline.build_draw_ops_spec", return_value={}),
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertIn("ops", result.ops_spec)
        self.assertEqual(len(result.ops_spec["ops"]), 1)
        op = result.ops_spec["ops"][0]
        self.assertEqual(op.op, "filter")
        self.assertEqual(op.group, ["Broadcasting", "Commercial"])

    def test_draw_plan_mode_export_runs_builder_and_export(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue",
                    "paramsHint": {"field": "@primary_measure"},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure"}, "inputs": []}
        ]

        with (
            patch.dict(os.environ, {"DRAW_PLAN_MODE": "export"}, clear=False),
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch(
                "opsspec.modules.pipeline.build_draw_ops_spec",
                return_value={"ops": [{"op": "draw", "action": "clear"}]},
            ) as draw_builder,
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")) as exporter,
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            _ = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertEqual(draw_builder.call_count, 1)
        self.assertEqual(exporter.call_count, 1)

    def test_draw_plan_mode_validate_runs_builder_without_export(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue",
                    "paramsHint": {"field": "@primary_measure"},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure"}, "inputs": []}
        ]

        with (
            patch.dict(os.environ, {"DRAW_PLAN_MODE": "validate"}, clear=False),
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch(
                "opsspec.modules.pipeline.build_draw_ops_spec",
                return_value={"ops": [{"op": "draw", "action": "clear"}]},
            ) as draw_builder,
            patch("opsspec.modules.pipeline.export_draw_plan_to_public", return_value=Path("/tmp/draw_plan.json")) as exporter,
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            _ = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=True,
            )

        self.assertEqual(draw_builder.call_count, 1)
        self.assertEqual(exporter.call_count, 0)

    def test_draw_plan_validate_failure_warn_policy(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue",
                    "paramsHint": {"field": "@primary_measure"},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure"}, "inputs": []}
        ]

        with (
            patch.dict(
                os.environ,
                {"DRAW_PLAN_MODE": "validate", "DRAW_PLAN_FAILURE_POLICY": "warn"},
                clear=False,
            ),
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch(
                "opsspec.modules.pipeline.build_draw_ops_spec",
                return_value={"ops": [{"op": "draw", "action": "invalid-action"}]},
            ),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={},
                data_rows=self.rows,
                request_id="req",
                debug=False,
            )

        self.assertTrue(any("draw plan validate failed" in warning for warning in result.warnings))

    def test_draw_plan_validate_failure_raise_policy(self) -> None:
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average revenue",
                    "paramsHint": {"field": "@primary_measure"},
                }
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "average", "field": "@primary_measure"}, "inputs": []}
        ]

        with (
            patch.dict(
                os.environ,
                {"DRAW_PLAN_MODE": "validate", "DRAW_PLAN_FAILURE_POLICY": "raise"},
                clear=False,
            ),
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(self.context, [], self.rows_preview)),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch(
                "opsspec.modules.pipeline.build_draw_ops_spec",
                return_value={"ops": [{"op": "draw", "action": "invalid-action"}]},
            ),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            with self.assertRaisesRegex(RuntimeError, "draw plan validate failed"):
                _ = pipeline.generate(
                    question="q",
                    explanation="e",
                    vega_lite_spec={},
                    data_rows=self.rows,
                    request_id="req",
                    debug=False,
                )

    def test_pipeline_keeps_linear_phase_metadata_and_validates_draw_plan(self) -> None:
        simple_context = ChartContext(
            fields=["Year", "Installed base in million units"],
            dimension_fields=["Year"],
            measure_fields=["Installed base in million units"],
            primary_dimension="Year",
            primary_measure="Installed base in million units",
            series_field=None,
            categorical_values={"Year": ["1995", "1999", "2010", "2013", "2017"]},
            mark="bar",
            is_stacked=False,
        )
        rows = [
            {"Year": "1995", "Installed base in million units": 10},
            {"Year": "1999", "Installed base in million units": 14},
            {"Year": "2010", "Installed base in million units": 20},
            {"Year": "2013", "Installed base in million units": 22},
            {"Year": "2017", "Installed base in million units": 26},
        ]
        inventory_payload = {
            "tasks": [
                {
                    "taskId": "o1",
                    "op": "filter",
                    "sentenceIndex": 1,
                    "mention": "filter 1995 and 1999",
                    "paramsHint": {"field": "Year", "include": ["1995", "1999"]},
                },
                {
                    "taskId": "o2",
                    "op": "average",
                    "sentenceIndex": 1,
                    "mention": "average first period",
                    "paramsHint": {"field": "Installed base in million units"},
                },
                {
                    "taskId": "o3",
                    "op": "filter",
                    "sentenceIndex": 2,
                    "mention": "filter 2010 2013 2017",
                    "paramsHint": {"field": "Year", "include": ["2010", "2013", "2017"]},
                },
                {
                    "taskId": "o4",
                    "op": "average",
                    "sentenceIndex": 2,
                    "mention": "average second period",
                    "paramsHint": {"field": "Installed base in million units"},
                },
                {
                    "taskId": "o5",
                    "op": "diff",
                    "sentenceIndex": 3,
                    "mention": "difference between the averages",
                    "paramsHint": {"field": "Installed base in million units"},
                },
            ],
            "warnings": [],
        }
        step_payloads = [
            {"pickTaskId": "o1", "op_spec": {"op": "filter", "field": "Year", "include": ["1995", "1999"]}, "inputs": []},
            {"pickTaskId": "o2", "op_spec": {"op": "average", "field": "Installed base in million units"}, "inputs": ["n1"]},
            {"pickTaskId": "o3", "op_spec": {"op": "filter", "field": "Year", "include": ["2010", "2013", "2017"]}, "inputs": []},
            {"pickTaskId": "o4", "op_spec": {"op": "average", "field": "Installed base in million units"}, "inputs": ["n3"]},
            {
                "pickTaskId": "o5",
                "op_spec": {
                    "op": "diff",
                    "field": "Installed base in million units",
                    "targetA": "ref:n2",
                    "targetB": "ref:n4",
                },
                "inputs": ["n2", "n4"],
            },
        ]

        with (
            patch.dict(os.environ, {"DRAW_PLAN_MODE": "validate"}, clear=False),
            patch("opsspec.modules.pipeline.build_chart_context", return_value=(simple_context, [], rows[:2])),
            patch("opsspec.modules.pipeline.run_inventory_module", return_value=inventory_payload),
            patch("opsspec.modules.pipeline.run_step_compose_module", side_effect=step_payloads),
            patch("opsspec.modules.pipeline._persist_debug_bundle", return_value=Path("/tmp/debug_bundle")),
        ):
            pipeline = self._pipeline()
            result = pipeline.generate(
                question="q",
                explanation="e",
                vega_lite_spec={"mark": "bar"},
                data_rows=rows,
                request_id="req",
                debug=False,
            )

        left_branch = result.ops_spec["ops"]
        right_branch = result.ops_spec["ops2"]
        join_op = result.ops_spec["ops3"][0]

        self.assertEqual(left_branch[0].meta.view.phase, 1)
        self.assertEqual(left_branch[1].meta.view.phase, 2)
        self.assertEqual(right_branch[0].meta.view.phase, 1)
        self.assertEqual(right_branch[1].meta.view.phase, 2)
        self.assertEqual(join_op.meta.view.phase, 3)
        self.assertIsNone(left_branch[0].meta.view.splitGroup)
        self.assertIsNone(right_branch[0].meta.view.panelId)
        self.assertFalse(bool(join_op.meta.view.joinBarrier))
        self.assertFalse(any("draw plan validate failed" in warning for warning in result.warnings))

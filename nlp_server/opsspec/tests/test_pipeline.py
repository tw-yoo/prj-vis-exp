from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from opsspec.pipeline import OpsSpecPipeline


class PipelineRetryTest(unittest.TestCase):
    def test_compile_retry_on_validation_failure(self) -> None:
        compile_calls: list[list[str]] = []

        def fake_decompose(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            question,
            explanation,
            chart_context,
            roles_summary,
            series_domain,
            measure_fields,
            rows_preview,
            validation_feedback,
        ):
            return {
                "plan_tree": {
                    "nodes": [
                        {
                            "nodeId": "n1",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "@primary_measure"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        }
                    ],
                    "warnings": [],
                },
                "warnings": [],
            }

        def fake_ground(*, llm, prompt_template, shared_rules, plan_tree, chart_context, rows_preview):  # type: ignore[no-untyped-def]
            # Ground module should preserve the plan nodes (role resolution omitted in this mock).
            return {"grounded_plan_tree": plan_tree, "warnings": []}

        def fake_compile(
            *,
            llm,
            prompt_template,
            shared_rules,
            grounded_plan_tree,
            chart_context,
            ops_contract,
            validation_feedback,
        ):  # type: ignore[no-untyped-def]
            compile_calls.append(list(validation_feedback or []))
            if len(compile_calls) == 1:
                return {
                    "ops_spec": {
                        "ops": [
                            {
                                "op": "average",
                                "field": "not_a_field",
                                "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                            },
                        ]
                    },
                    "warnings": [],
                }
            return {
                "ops_spec": {
                    "ops": [
                        {
                            "op": "average",
                            "field": "Revenue_Million_Euros",
                            "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                        },
                    ]
                },
                "warnings": [],
            }

        pipeline = OpsSpecPipeline(
            ollama_model="qwen2.5-coder:1.5b",
            ollama_base_url="http://localhost:11434/v1",
            ollama_api_key="ollama",
            prompts_dir=Path(__file__).resolve().parents[2] / "prompts",
        )

        spec = {
            "mark": "bar",
            "encoding": {
                "x": {"field": "season", "type": "nominal"},
                "y": {"field": "Revenue_Million_Euros", "type": "quantitative"},
                "color": {"field": "category", "type": "nominal"},
            },
        }
        rows = [
            {"season": "2016/17", "category": "Broadcasting", "Revenue_Million_Euros": 200.0},
            {"season": "2017/18", "category": "Commercial", "Revenue_Million_Euros": 240.0},
        ]

        with (
            patch("opsspec.pipeline.run_decompose_module", side_effect=fake_decompose),
            patch("opsspec.pipeline.run_ground_module", side_effect=fake_ground),
            patch("opsspec.pipeline.run_compile_module", side_effect=fake_compile),
        ):
            result = pipeline.generate(
                question="Q",
                explanation="E",
                vega_lite_spec=spec,
                data_rows=rows,
                request_id="t1",
                debug=False,
            )

        self.assertEqual(len(compile_calls), 2)
        self.assertTrue(any("compile attempt 1/3 failed" in warn for warn in result.warnings))
        self.assertEqual(result.ops_spec["ops"][0].field, "Revenue_Million_Euros")


if __name__ == "__main__":
    unittest.main()

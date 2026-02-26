from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from opsspec.modules.pipeline import OpsSpecPipeline


class PipelineRetryTest(unittest.TestCase):
    def test_specify_retry_on_validation_failure(self) -> None:
        """Module 3 (Specify) 첫 번째 시도 실패 시 두 번째 시도에서 성공하는지 검증."""
        specify_calls: list[list[str]] = []

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

        def fake_resolve(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            plan_tree,
            chart_context,
            rows_preview,
            validation_feedback,
        ):
            # Module 2는 @token을 실제 필드명으로 치환해서 반환
            return {
                "grounded_plan_tree": {
                    "nodes": [
                        {
                            "nodeId": "n1",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "Revenue_Million_Euros"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        }
                    ],
                    "warnings": [],
                },
                "warnings": [],
                "llm_called": False,
                "_debug_steps": {},
            }

        def fake_specify(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            grounded_plan_tree,
            chart_context,
            ops_contract,
            validation_feedback,
        ):
            specify_calls.append(list(validation_feedback or []))
            if len(specify_calls) == 1:
                # 첫 번째 시도: 존재하지 않는 field 반환 → validation 실패
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
            # 두 번째 시도: 올바른 field 반환 → 성공
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
            patch("opsspec.modules.pipeline.run_decompose_module", side_effect=fake_decompose),
            patch("opsspec.modules.pipeline.run_resolve_module", side_effect=fake_resolve),
            patch("opsspec.modules.pipeline.run_specify_module", side_effect=fake_specify),
        ):
            result = pipeline.generate(
                question="Q",
                explanation="E",
                vega_lite_spec=spec,
                data_rows=rows,
                request_id="t1",
                debug=False,
            )

        self.assertEqual(len(specify_calls), 2)
        self.assertTrue(any("specify attempt 1/3 failed" in warn for warn in result.warnings))
        self.assertEqual(result.ops_spec["ops"][0].field, "Revenue_Million_Euros")


class DecomposeRetrySeriesRestrictionTest(unittest.TestCase):
    def test_decompose_retry_when_series_field_filter_is_forbidden(self) -> None:
        """Module 1 (Decompose)에서 series_field membership filter가 나오면 strict retry로 교정되는지 검증."""

        decompose_feedbacks: list[list[str]] = []
        decompose_attempt = {"n": 0}

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
            decompose_feedbacks.append(list(validation_feedback or []))
            decompose_attempt["n"] += 1
            if decompose_attempt["n"] == 1:
                # Forbidden: membership filter on @series_field
                return {
                    "plan_tree": {
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
                    },
                    "warnings": [],
                }
            # Corrected: represent series restriction via params.group on compute nodes
            return {
                "plan_tree": {
                    "nodes": [
                        {
                            "nodeId": "n1",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "@primary_measure", "group": "Lending"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        },
                        {
                            "nodeId": "n2",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "@primary_measure", "group": "Investment"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        },
                    ],
                    "warnings": [],
                },
                "warnings": [],
            }

        def fake_resolve(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            plan_tree,
            chart_context,
            rows_preview,
            validation_feedback,
        ):
            # Module 2는 @token을 실제 필드명으로 치환해서 반환
            return {
                "grounded_plan_tree": {
                    "nodes": [
                        {
                            "nodeId": "n1",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "Value", "group": "Lending"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        },
                        {
                            "nodeId": "n2",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "Value", "group": "Investment"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        },
                    ],
                    "warnings": [],
                },
                "warnings": [],
                "llm_called": False,
                "_debug_steps": {},
            }

        def fake_specify(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            grounded_plan_tree,
            chart_context,
            ops_contract,
            validation_feedback,
        ):
            return {
                "ops_spec": {
                    "ops": [
                        {
                            "op": "average",
                            "field": "Value",
                            "group": "Lending",
                            "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                        },
                        {
                            "op": "average",
                            "field": "Value",
                            "group": "Investment",
                            "meta": {"nodeId": "n2", "inputs": [], "sentenceIndex": 1},
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
            "mark": "line",
            "encoding": {
                "x": {"field": "Year", "type": "nominal"},
                "y": {"field": "Value", "type": "quantitative"},
                "color": {"field": "Type", "type": "nominal"},
            },
        }
        rows = [
            {"Year": "2010", "Type": "Lending", "Value": 0.1},
            {"Year": "2010", "Type": "Investment", "Value": 0.2},
        ]

        with (
            patch("opsspec.modules.pipeline.run_decompose_module", side_effect=fake_decompose),
            patch("opsspec.modules.pipeline.run_resolve_module", side_effect=fake_resolve),
            patch("opsspec.modules.pipeline.run_specify_module", side_effect=fake_specify),
        ):
            result = pipeline.generate(
                question="Show values for Lending and Investment.",
                explanation="Look at the Lending and Investment series.",
                vega_lite_spec=spec,
                data_rows=rows,
                request_id="t_decompose_retry_1",
                debug=False,
            )

        self.assertGreaterEqual(decompose_attempt["n"], 2)
        # 2nd attempt should receive feedback about forbidden series_field filter.
        self.assertTrue(any("Series restriction cannot be expressed" in line for line in decompose_feedbacks[1]))
        self.assertTrue(any("decompose attempt 1/3 failed" in warn for warn in result.warnings))


if __name__ == "__main__":
    unittest.main()

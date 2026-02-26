from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from opsspec.core.llm import StructuredLLMClient
from opsspec.modules.answer_pipeline import ChartAnswerPipeline


class AnswerPipelineTest(unittest.TestCase):
    def test_answer_pipeline_builds_prompt_and_returns_payload(self) -> None:
        captured: dict[str, str] = {}

        def fake_complete(  # type: ignore[no-untyped-def]
            self,
            *,
            response_model,
            system_prompt,
            user_prompt,
            task_name,
        ):
            _ = (response_model, system_prompt, task_name)
            captured["user_prompt"] = user_prompt
            return {
                "plan": ["Check the legend and compare bars."],
                "answer": "East.",
                "explanation": "The East bar is tallest in the relevant series.",
                "warnings": [],
            }

        pipeline = ChartAnswerPipeline(
            ollama_model="qwen2.5-coder:1.5b",
            ollama_base_url="http://localhost:11434/v1",
            ollama_api_key="ollama",
            prompts_dir=Path(__file__).resolve().parents[2] / "prompts",
        )

        spec = {
            "mark": "bar",
            "encoding": {
                "x": {"field": "Region", "type": "nominal"},
                "y": {"field": "Sales", "type": "quantitative"},
                "color": {"field": "Product", "type": "nominal"},
            },
        }
        rows = [
            {"Region": "North", "Product": "Gadget", "Sales": 120},
            {"Region": "East", "Product": "Gadget", "Sales": 150},
        ]

        with patch.object(StructuredLLMClient, "complete", new=fake_complete):
            out = pipeline.answer(
                question="Which Region is highest for Gadget?",
                vega_lite_spec=spec,
                data_rows=rows,
                request_id="t1",
                debug=False,
            )

        self.assertEqual(out["answer"], "East.")
        self.assertIn("CSV Data Input", captured.get("user_prompt", ""))
        self.assertIn("Region,Sales,Product", captured.get("user_prompt", ""))

    def test_answer_pipeline_accepts_paths(self) -> None:
        def fake_complete(  # type: ignore[no-untyped-def]
            self,
            *,
            response_model,
            system_prompt,
            user_prompt,
            task_name,
        ):
            _ = (response_model, system_prompt, user_prompt, task_name)
            return {
                "plan": ["Read the tallest bar."],
                "answer": "East.",
                "explanation": "East is highest.",
                "warnings": [],
            }

        pipeline = ChartAnswerPipeline(
            ollama_model="qwen2.5-coder:1.5b",
            ollama_base_url="http://localhost:11434/v1",
            ollama_api_key="ollama",
            prompts_dir=Path(__file__).resolve().parents[2] / "prompts",
        )

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec_path = root / "spec.json"
            csv_path = root / "data.csv"
            spec_path.write_text(
                '{"mark":"bar","encoding":{"x":{"field":"Region","type":"nominal"},"y":{"field":"Sales","type":"quantitative"}}}',
                encoding="utf-8",
            )
            csv_path.write_text("Region,Sales\nNorth,120\nEast,150\n", encoding="utf-8")

            with patch.object(StructuredLLMClient, "complete", new=fake_complete):
                out = pipeline.answer_from_paths(
                    question="Which Region is highest?",
                    vega_lite_spec_path=str(spec_path),
                    data_csv_path=str(csv_path),
                    request_id="t2",
                    debug=False,
                    _allowed_root=root,
                )

        self.assertEqual(out["answer"], "East.")

    def test_answer_pipeline_calls_gemini(self) -> None:
        def fake_gemini(self, *, system_prompt: str, user_prompt: str) -> str:
            return '{"plan":["check legend"],"answer":"East.","explanation":"East highest","warnings":[]}'

        pipeline = ChartAnswerPipeline(
            ollama_model="qwen2.5-coder:1.5b",
            ollama_base_url="http://localhost:11434/v1",
            ollama_api_key="ollama",
            prompts_dir=Path(__file__).resolve().parents[2] / "prompts",
        )

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec_path = root / "spec.json"
            csv_path = root / "data.csv"
            spec_path.write_text(
                '{"mark":"bar","encoding":{"x":{"field":"Region","type":"nominal"},"y":{"field":"Sales","type":"quantitative"}}}',
                encoding="utf-8",
            )
            csv_path.write_text("Region,Sales\nNorth,120\nEast,150\n", encoding="utf-8")

            with patch.object(ChartAnswerPipeline, "_call_gemini_api", new=fake_gemini):
                out = pipeline.answer_from_paths(
                    question="Which Region is highest?",
                    vega_lite_spec_path=str(spec_path),
                    data_csv_path=str(csv_path),
                    request_id="t3",
                    debug=False,
                    _allowed_root=root,
                    llm_choice="gemini",
                )

        self.assertEqual(out["answer"], "East.")

if __name__ == "__main__":
    unittest.main()

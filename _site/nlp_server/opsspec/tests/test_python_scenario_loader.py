from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from opsspec.runtime.python_scenario_loader import PythonScenarioLoadError, load_python_scenario_request


def _scenario_payload_literal() -> str:
    return """{
    "question": "Q",
    "explanation": "E",
    "vega_lite_spec": {"mark": "bar", "encoding": {"x": {"field": "month", "type": "nominal"}, "y": {"field": "count", "type": "quantitative"}}},
    "data_rows": [{"month": "Jan", "count": 1}],
    "debug": False
}"""


class PythonScenarioLoaderTest(unittest.TestCase):
    def test_loads_build_request_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            expert_root = repo_root / "data" / "expert" / "e1"
            expert_root.mkdir(parents=True, exist_ok=True)
            scenario_path = expert_root / "sample.py"
            scenario_path.write_text(
                "def build_request():\n"
                f"    return {_scenario_payload_literal()}\n",
                encoding="utf-8",
            )

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                request, normalized = load_python_scenario_request("data/expert/e1/sample.py")

            self.assertEqual(normalized, "data/expert/e1/sample.py")
            self.assertEqual(request.question, "Q")
            self.assertEqual(len(request.data_rows), 1)

    def test_loads_request_constant_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            expert_root = repo_root / "data" / "expert" / "e1"
            expert_root.mkdir(parents=True, exist_ok=True)
            scenario_path = expert_root / "sample_const.py"
            scenario_path.write_text(
                f"REQUEST = {_scenario_payload_literal()}\n",
                encoding="utf-8",
            )

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                request, normalized = load_python_scenario_request(str(scenario_path))

            self.assertEqual(normalized, "data/expert/e1/sample_const.py")
            self.assertEqual(request.explanation, "E")

    def test_rejects_path_outside_allowed_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            outside_file = repo_root / "outside.py"
            outside_file.write_text("REQUEST = {}", encoding="utf-8")

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                with self.assertRaises(PythonScenarioLoadError):
                    load_python_scenario_request(str(outside_file))

    def test_rejects_missing_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            expert_root = repo_root / "data" / "expert"
            expert_root.mkdir(parents=True, exist_ok=True)
            scenario_path = expert_root / "invalid.py"
            scenario_path.write_text("x = 1\n", encoding="utf-8")

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                with self.assertRaises(PythonScenarioLoadError):
                    load_python_scenario_request("data/expert/invalid.py")


if __name__ == "__main__":
    unittest.main()

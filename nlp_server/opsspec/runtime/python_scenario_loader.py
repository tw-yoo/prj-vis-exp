from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path
from types import ModuleType
from typing import Any

from models import GenerateGrammarRequest


class PythonScenarioLoadError(ValueError):
    """Raised when a python scenario cannot be loaded or validated."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _allowed_root() -> Path:
    return _repo_root() / "data" / "expert"


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _resolve_candidate_path(scenario_path: str) -> Path:
    raw = scenario_path.strip()
    if not raw:
        raise PythonScenarioLoadError("scenario_path is empty.")

    root = _allowed_root().resolve()
    as_path = Path(raw)
    if as_path.is_absolute():
        candidate = as_path.resolve()
    else:
        candidate = (_repo_root() / as_path).resolve()

    if candidate.suffix.lower() != ".py":
        raise PythonScenarioLoadError("scenario_path must point to a .py file.")
    if not _path_is_within(candidate, root):
        raise PythonScenarioLoadError("scenario_path must be under data/expert.")
    if not candidate.exists():
        raise PythonScenarioLoadError(f"scenario file not found: {scenario_path}")
    if not candidate.is_file():
        raise PythonScenarioLoadError(f"scenario path is not a file: {scenario_path}")
    return candidate


def _load_module_from_path(path: Path) -> ModuleType:
    module_name = f"python_scenario_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise PythonScenarioLoadError(f"failed to import scenario module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def _extract_request_payload(module: ModuleType) -> dict[str, Any]:
    if hasattr(module, "build_request"):
        build_request = getattr(module, "build_request")
        if not callable(build_request):
            raise PythonScenarioLoadError('"build_request" exists but is not callable.')
        payload = build_request()
    elif hasattr(module, "REQUEST"):
        payload = getattr(module, "REQUEST")
    else:
        raise PythonScenarioLoadError('scenario must define "build_request()" or "REQUEST".')

    if not isinstance(payload, dict):
        raise PythonScenarioLoadError("scenario request payload must be a dict object.")
    return payload


def load_python_scenario_request(scenario_path: str) -> tuple[GenerateGrammarRequest, str]:
    """
    Load scenario request from a Python file under data/expert.

    Contract:
    - Either `build_request() -> dict` or `REQUEST = {...}` must exist.
    - The payload must satisfy GenerateGrammarRequest schema.
    """
    candidate = _resolve_candidate_path(scenario_path)
    module = _load_module_from_path(candidate)
    payload = _extract_request_payload(module)
    request = GenerateGrammarRequest.model_validate(payload)
    relative_path = str(candidate.relative_to(_repo_root().resolve()))
    return request, relative_path

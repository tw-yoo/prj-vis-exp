from __future__ import annotations

import json
import logging
import os
import ssl
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Type

from pydantic import BaseModel

try:
    import instructor
except ImportError:  # pragma: no cover
    instructor = None

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

try:
    import certifi
except ImportError:  # pragma: no cover
    certifi = None

logger = logging.getLogger(__name__)


class StructuredLLMClient:
    def __init__(
        self,
        ollama_model: str,
        ollama_base_url: str,
        ollama_api_key: str,
        instructor_mode: str = "JSON",
    ) -> None:
        self.ollama_model = ollama_model
        self.ollama_base_url = ollama_base_url
        self.ollama_api_key = ollama_api_key
        self.instructor_mode = instructor_mode
        self.backend: Optional[str] = None
        self.client: Any = None

    def _ssl_context(self) -> ssl.SSLContext:
        """
        Build an SSL context for HTTPS requests.

        Priority:
        1) SSL_CERT_FILE env var (explicit override)
        2) certifi CA bundle (if installed)
        3) Python default trust store
        """
        explicit = os.getenv("SSL_CERT_FILE", "").strip()
        if explicit:
            return ssl.create_default_context(cafile=explicit)
        if certifi is not None:
            return ssl.create_default_context(cafile=certifi.where())
        return ssl.create_default_context()

    def _urlopen(self, request: urllib.request.Request, *, endpoint: str, timeout: int) -> bytes:
        kwargs: Dict[str, Any] = {"timeout": timeout}
        if endpoint.lower().startswith("https://"):
            kwargs["context"] = self._ssl_context()
        with urllib.request.urlopen(request, **kwargs) as resp:
            return resp.read()

    def load(self) -> None:
        if self.backend is not None:
            return

        forced_backend = os.getenv("LLM_BACKEND", "").strip().lower()
        has_openai_key = bool(os.getenv("OPENAI_API_KEY", "").strip())

        # Default to ChatGPT/OpenAI API when credentials are available.
        # Use LLM_BACKEND to override (e.g., "ollama" for local runs).
        if forced_backend in {"", "openai", "chatgpt"} and has_openai_key:
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
            self.backend = "openai_http"
            self.client = None
            logger.info(
                "LLM backend: openai_http | model=%s base_url=%s",
                model,
                os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            )
            return

        if forced_backend in {"openai", "chatgpt"} and not has_openai_key:
            raise RuntimeError("LLM_BACKEND=openai requires OPENAI_API_KEY.")

        if instructor is not None and OpenAI is not None:
            base = OpenAI(base_url=self.ollama_base_url, api_key=self.ollama_api_key)
            mode = getattr(getattr(instructor, "Mode", None), self.instructor_mode, None)
            if mode is None:
                mode = instructor.Mode.JSON
            self.client = instructor.from_openai(base, mode=mode)
            self.backend = "instructor_openai"
            logger.info(
                "LLM backend: instructor_openai | model=%s base_url=%s mode=%s",
                self.ollama_model,
                self.ollama_base_url,
                self.instructor_mode,
            )
            return

        self.backend = "ollama_native"
        self.client = None
        logger.warning(
            "LLM backend: ollama_native (fallback) | model=%s base_url=%s"
            " — instructor/openai not installed.",
            self.ollama_model,
            self.ollama_base_url,
        )

    def complete(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        if self.backend == "instructor_openai":
            return self._complete_instructor(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                task_name=task_name,
            )
        if self.backend == "openai_http":
            return self._complete_openai_http(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                task_name=task_name,
            )
        if self.backend == "ollama_native":
            return self._complete_native(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
        raise RuntimeError("LLM backend is not initialized.")

    def _complete_instructor(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        started = time.perf_counter()
        try:
            parsed = self.client.chat.completions.create(
                model=self.ollama_model,
                response_model=response_model,
                temperature=0,
                top_p=1,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                extra_body={
                    "format": response_model.model_json_schema(),
                    "options": {"temperature": 0, "top_p": 1},
                },
            )
        except Exception as exc:
            raise RuntimeError(f"{task_name} completion failed: {exc}") from exc

        try:
            payload = parsed if isinstance(parsed, dict) else parsed.model_dump()
            validated = response_model.model_validate(payload)
            result = validated.model_dump(by_alias=True)
            # instructor는 raw string을 직접 노출하지 않으므로 validated dump를 best-effort로 저장.
            result["_raw_llm_response"] = json.dumps(payload, ensure_ascii=False)
            result["_llm_elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
            return result
        except Exception as exc:
            raise RuntimeError(f"{task_name} response validation failed: {exc}") from exc

    def _complete_native(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        base_url = self.ollama_base_url.rstrip("/")
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]
        endpoint = f"{base_url}/api/chat"
        payload = {
            "model": self.ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "format": response_model.model_json_schema(),
            "options": {"temperature": 0, "top_p": 1},
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        started = time.perf_counter()
        try:
            raw = self._urlopen(request, endpoint=endpoint, timeout=120).decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Ollama HTTP error ({exc.code}): {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to call Ollama native API: {exc}") from exc

        try:
            outer = json.loads(raw)
            raw_content: str = outer["message"]["content"]
            inner = json.loads(raw_content)
            validated = response_model.model_validate(inner)
            result = validated.model_dump(by_alias=True)
            result["_raw_llm_response"] = raw_content
            result["_llm_elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
            return result
        except Exception as exc:
            raise RuntimeError(f"Failed to parse native structured output: {exc}") from exc

    def _complete_openai_http(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        endpoint = f"{base_url}/chat/completions"

        payload = {
            "model": model,
            "temperature": 0,
            "top_p": 1,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            # Ask for JSON object; we still validate using Pydantic after parsing.
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )
        started = time.perf_counter()
        try:
            raw = self._urlopen(request, endpoint=endpoint, timeout=120).decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"OpenAI HTTP error ({exc.code}): {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to call OpenAI API: {exc}") from exc

        try:
            outer = json.loads(raw)
            content = outer["choices"][0]["message"]["content"]
            inner = json.loads(content) if isinstance(content, str) else content
            validated = response_model.model_validate(inner)
            result = validated.model_dump(by_alias=True)
            # LLM이 실제로 반환한 raw JSON string(Pydantic 검증 전)을 저장.
            result["_raw_llm_response"] = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
            result["_llm_elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
            return result
        except Exception as exc:
            raise RuntimeError(f"{task_name} response parsing/validation failed: {exc}") from exc

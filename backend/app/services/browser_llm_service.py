"""Validate client-reported local inference; never contact an external provider."""
import hashlib
import json
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.services.llm_triage_service import LLMRun
from app.services.customer_support_service import BrowserSupportResult

MANIFEST = json.loads((Path(__file__).parent / "browser_llm_manifest.json").read_text(encoding="utf-8"))
PROMPT_HASH = hashlib.sha256(json.dumps(MANIFEST, sort_keys=True).encode("utf-8")).hexdigest()


class BrowserLLMResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    status: Literal["success", "error", "disabled"]
    revision: str = Field(max_length=40)
    output_token: Optional[Literal["A", "B", "C", "D", "E", "F", "G", "H"]] = None
    input_sha256: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    latency_ms: float = Field(default=0, ge=0, le=1000000, allow_inf_nan=False)
    error_code: Optional[Literal[
        "cancelled", "timeout", "unsupported_browser", "load_failed", "input_too_long", "invalid_output",
    ]] = None
    support: Optional[BrowserSupportResult] = None

    @model_validator(mode="after")
    def validate_result(self):
        if self.status == "success":
            if self.output_token is None or self.input_sha256 is None or self.error_code is not None:
                raise ValueError("Successful browser inference requires a token and input hash")
        elif self.output_token is not None:
            raise ValueError("Failed or disabled inference cannot supply a category")
        if self.status != "success" and self.support is not None:
            raise ValueError("Support selection requires a completed local classification")
        return self


def browser_input_hash(report_text: str, device_type: str, patient_connected: bool) -> str:
    payload = json.dumps({
        "report_text": report_text.strip(), "device_type": device_type, "patient_connected": patient_connected,
    }, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def browser_run(result: BrowserLLMResult, *, report_text: str, device_type: str, patient_connected: bool) -> LLMRun:
    run = LLMRun(
        status=result.status, provider="browser-local", requested_model=MANIFEST["model"],
        prompt_version=MANIFEST["prompt_version"], prompt_sha256=PROMPT_HASH,
        client_reported=True, model_revision=MANIFEST["revision"],
        runtime=MANIFEST["runtime"], quantization=MANIFEST["dtype"],
        latency_ms=result.latency_ms, error_code=result.error_code,
    )
    if result.status != "success":
        return run
    expected_hash = browser_input_hash(report_text, device_type, patient_connected)
    if result.revision != MANIFEST["revision"] or result.input_sha256 != expected_hash:
        run.status, run.error_code = "invalid_response", "browser_context_mismatch"
        return run
    # A client can forge this hash. Model execution and prompt are not attested.
    run.model = MANIFEST["model"]
    run.input_sha256 = expected_hash
    run.output_token = result.output_token
    run.browser_category = MANIFEST["categories"][result.output_token]
    return run

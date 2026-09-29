"""Regression tests for reference-gated local LLM maintenance inference."""

from app.services.llm_triage_service import LLMRun
from app.services.generated_guidance_service import MANIFEST, resolve_guidance


def test_no_selected_reference_blocks_generated_maintenance_guidance():
    context = {
        "version": MANIFEST["version"],
        "input_sha256": "a" * 64,
        "report_text": "Unknown device fault",
        "references": [],
    }

    class Result:
        version = MANIFEST["version"]
        input_sha256 = "a" * 64
        status = "success"
        text = "A fabricated maintenance answer must never be accepted."
        latency_ms = 1
        reference_id = None
        completion_tokens = 10

    run = LLMRun(status="success", model="local-test")
    result = resolve_guidance(
        context,
        Result(),
        run,
        patient_connected=False,
        is_emergency=False,
        selected_reference=None,
        out_of_scope=False,
    )

    assert result["status"] == "BLOCKED"
    assert result["error_code"] == "not_allowed"
    assert result["text"] == ""
    assert "reference" in result["message"].lower()

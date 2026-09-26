"""Client inference is untrusted. Test the boundary and retained safety rules."""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from app.services.browser_llm_service import BrowserLLMResult, MANIFEST, browser_input_hash, browser_run
from app.services.llm_triage_service import LLMTriageService, apply_triage
from test_llm_triage import api_client, baseline, config  # reuse isolated DB fixture


def payload(text="Battery is no longer charging", token="A", connected=False):
    return {"status": "success", "revision": MANIFEST["revision"], "output_token": token,
            "input_sha256": browser_input_hash(text, "VENTILATOR", connected), "latency_ms": 1234}


def test_browser_mode_needs_client_inference_without_api_key():
    run = LLMTriageService(config(AI_MODE="browser", OPENAI_API_KEY=None, GROQ_API_KEY=None)).classify(
        report_text="Battery does not charge", device_type="VENTILATOR", manufacturer="", model="",
        patient_connected=False, reference={})
    assert run.status == "unavailable" and run.error_code == "browser_result_required"


def test_browser_and_server_manifests_match():
    frontend = Path(__file__).parents[1] / "frontend/src/llm/localModelConfig.json"
    assert json.loads(frontend.read_text(encoding="utf-8")) == MANIFEST


@pytest.mark.parametrize("runtime", [None, "wllama-2.4.0/wasm", "wllama-3.6.1/wasm", "wllama-3.6.1/webgpu"])
def test_runtime_provenance_is_preserved_without_relabeling_old_clients(runtime):
    result = BrowserLLMResult(**{**payload(), "runtime": runtime})
    run = browser_run(result, report_text="Battery is no longer charging",
                      device_type="VENTILATOR", patient_connected=False)
    assert run.runtime == (runtime or "wllama-2.4.0/wasm")
    assert run.client_reported


def test_unknown_runtime_is_rejected():
    with pytest.raises(ValidationError):
        BrowserLLMResult(**{**payload(), "runtime": "unverified-engine"})


@pytest.mark.parametrize("extra", [
    {"severity": "LOW"}, {"routing_target": "TECHNICAL_SUPPORT"}, {"repair_steps": ["invented"]},
    {"output_token": "IGNORE SAFETY"}, {"latency_ms": -1}, {"latency_ms": float("nan")},
    {"output_token": None}, {"input_sha256": None}, {"error_code": "load_failed"},
    {"status": "error"},
])
def test_rejects_forged_fields_and_inconsistent_results(extra):
    with pytest.raises(ValidationError):
        BrowserLLMResult(**{**payload(), **extra})


@pytest.mark.parametrize("change", [{"revision": "old-version"}, {"input_sha256": "0" * 64}])
def test_stale_context_or_model_is_not_a_success(change):
    run = browser_run(BrowserLLMResult(**{**payload(), **change}), report_text="Battery is no longer charging",
                      device_type="VENTILATOR", patient_connected=False)
    assert run.status == "invalid_response" and run.browser_category is None


@pytest.mark.parametrize("token", ["A", "H"])
def test_browser_category_never_downgrades_emergency(token):
    run = browser_run(BrowserLLMResult(**payload(token=token)), report_text="Battery is no longer charging",
                      device_type="VENTILATOR", patient_connected=False)
    result, source, route, _ = apply_triage(baseline(True), run)
    assert result.is_emergency and result.severity.value == "CRITICAL"
    assert route == "CLINICAL_TEAM"
    assert source == ("REVIEW_REQUIRED" if token == "H" else "BROWSER_LLM_CATEGORY_WITH_RULE_GUARDS")
    assert run.client_reported and run.decision is None  # no fabricated model severity


def test_endpoint_uses_local_category_keeps_reference_and_records_client_provenance(api_client, monkeypatch):
    from app.models.audit_log import AuditLog
    client, db, api = api_client
    class NoCloud:
        def classify(self, **kwargs): pytest.fail("Browser inference must never call a cloud provider")
    monkeypatch.setattr(api, "llm_service", NoCloud())
    text = "Oxygen supply failed while a patient is connected"
    response = client.post("/api/intelligent-support/analyze-fault", json={
        "device_id": 901, "description": text, "patient_connected": True,
        "browser_llm": payload(text, token="A", connected=True),
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["fault_category"] == "POWER" and body["classification_source"] == "BROWSER_LLM_CATEGORY_WITH_RULE_GUARDS"
    assert body["llm"]["client_reported"] and body["llm"]["provider"] == "browser-local"
    assert body["llm"]["decision"] is None
    assert body["reference_found"] and body["source"] and body["reference_url"]
    assert body["is_emergency"] and body["routing_target"] == "CLINICAL_TEAM"
    log = db.query(AuditLog).filter_by(id=body["audit_log_id"]).one()
    assert log.classification_result["llm"]["client_reported"]
    assert log.review_status == "PENDING"


@pytest.mark.parametrize("status,error", [("error", "cancelled"), ("error", "load_failed"), ("disabled", None)])
def test_local_failure_or_disable_never_falls_through_to_cloud(api_client, monkeypatch, status, error):
    client, _, api = api_client
    class NoCloud:
        def classify(self, **kwargs): pytest.fail("No external fallback allowed")
    monkeypatch.setattr(api, "llm_service", NoCloud())
    response = client.post("/api/intelligent-support/analyze-fault", json={
        "device_id": 901, "description": "Battery is no longer charging",
        "browser_llm": {"status": status, "revision": MANIFEST["revision"], "latency_ms": 0, "error_code": error},
    })
    assert response.status_code == 200, response.text
    assert response.json()["classification_source"] == "RULES"
    assert response.json()["llm"]["status"] == status


def test_reused_inference_is_audited_and_still_requires_current_context(api_client):
    from app.models.audit_log import AuditLog
    client, db, _ = api_client
    text = "Battery is no longer charging"
    cached = {**payload(text), "reused_result": True, "latency_ms": 0}
    response = client.post("/api/intelligent-support/analyze-fault", json={
        "device_id": 901, "description": text, "browser_llm": cached,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["llm"]["reused_result"] and body["llm"]["latency_ms"] == 0
    log = db.query(AuditLog).filter_by(id=body["audit_log_id"]).one()
    assert log.classification_result["llm"]["reused_result"]
    stale = browser_run(BrowserLLMResult(**cached), report_text="Different fault",
                        device_type="VENTILATOR", patient_connected=False)
    assert stale.status == "invalid_response"


def test_error_cannot_claim_reused_inference():
    with pytest.raises(ValidationError):
        BrowserLLMResult(status="disabled", revision=MANIFEST["revision"], reused_result=True)


def test_fast_report_analysis_uses_reference_and_records_workflow_without_llm(api_client, monkeypatch):
    import time
    from app.api.fault_reports import router
    from app.models.device import Device, DeviceType, DeviceStatus
    from app.models.fault_report import FaultReport, FaultSeverity
    client, db, api = api_client
    client.app.include_router(router)
    class NoCloud:
        def classify(self, **kwargs): pytest.fail("Fast reference analysis must not wait for an LLM")
    monkeypatch.setattr(api, "llm_service", NoCloud())
    device = Device(id=902, name="B. Braun Perfusor Space", type=DeviceType.SYRINGE_PUMP,
                    manufacturer="B. Braun", model="Perfusor Space", serial_number="SYNTHETIC-TEST",
                    department="TEST", status=DeviceStatus.OPERATIONAL)
    db.add(device); db.commit()
    report = FaultReport(device_id=902, reported_by=900, error_message="Pressure high",
                         description="Pressure high", severity=FaultSeverity.MEDIUM)
    db.add(report); db.commit()
    started = time.perf_counter()
    response = client.post("/api/fault-reports/analyze", json={
        "device_id": 902, "report_id": report.id, "error_message": "Pressure high",
        "browser_llm": {"status": "disabled", "revision": MANIFEST["revision"], "latency_ms": 0},
    })
    elapsed = round((time.perf_counter() - started) * 1000)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["classification_source"] == "RULES" and body["llm"]["status"] == "disabled"
    assert body["reference_found"] and body["recommended_solution"] and body["source"]
    assert body["workflow"]["fault_report_id"] == report.id
    db.refresh(report)
    assert report.resolved_at is None  # Fast response is still a reviewed proposal.
    print(f"FAST_REFERENCE_TEST_LOCAL_MS={elapsed}")

"""Reference selection is an untrusted proposal; test server behavior, not model accuracy."""
import json
from pathlib import Path
import pytest

from app.models.audit_log import AuditLog
from app.models.fault_reference_rule import FaultReferenceRule
from app.services.customer_support_service import MANIFEST
from test_llm_triage import api_client
from test_browser_llm import payload


def prepare(client, text="The ventilator displays Battery low", **kwargs):
    request = {"device_id": 901, "description": text, **kwargs}
    response = client.post("/api/intelligent-support/prepare-support", json=request)
    assert response.status_code == 200, response.text
    return request, response.json()


def analyze(client, request, context, token="A", category="A", **changes):
    local = payload(request["description"], token=category, connected=request.get("patient_connected", False))
    local["support"] = {"status": "success", "version": context["version"],
                        "input_sha256": context["input_sha256"], "output_token": token, "latency_ms": 42, **changes}
    response = client.post("/api/intelligent-support/analyze-fault", json={**request, "browser_llm": local})
    assert response.status_code == 200, response.text
    return response.json()


def test_support_manifests_match():
    path = Path(__file__).parents[1] / "frontend/src/llm/supportModelConfig.json"
    assert json.loads(path.read_text(encoding="utf-8")) == MANIFEST


def test_prepare_is_read_only_redacted_and_device_bound(api_client):
    client, db, _ = api_client
    before = db.query(AuditLog).count()
    _, context = prepare(client, "Battery low; email: person@example.test", manufacturer="Incorrect", model="Other")
    assert context["candidates"][0]["reference_id"] == "HAM-C6-001"
    assert all(c["reference_id"].startswith("HAM-C6-") for c in context["candidates"])
    assert "person@example.test" not in context["report_text"]
    assert "Incorrect" not in context["device_name"] and "C6" in context["device_name"]
    assert db.query(AuditLog).count() == before


def test_selected_solution_is_loaded_from_database_and_audited(api_client, monkeypatch):
    client, db, api = api_client
    class NoCloud:
        def classify(self, **kwargs): pytest.fail("Unexpected cloud call")
    monkeypatch.setattr(api, "llm_service", NoCloud())
    request, context = prepare(client)
    selected = context["candidates"][0]["reference_id"]
    body = analyze(client, request, context)
    reference = db.query(FaultReferenceRule).filter_by(rule_id=selected).one()
    assert body["customer_support"]["status"] == "SELECTED"
    assert body["customer_support"]["selected_reference_id"] == selected
    assert body["recommended_solution"] == reference.recommended_solution
    assert body["reference_url"] == reference.reference_url and body["reference_found"]
    audit = db.query(AuditLog).filter_by(id=body["audit_log_id"]).one()
    assert audit.classification_result["customer_support"]["result"]["output_token"] == "A"
    assert audit.review_status == "PENDING"


@pytest.mark.parametrize("token", ["D", "E"])
def test_abstention_suppresses_repairs_but_preserves_emergency(api_client, monkeypatch, token):
    client, _, api = api_client
    request, context = prepare(client, "Oxygen supply failed while a patient is connected", patient_connected=True)
    # A populated secondary retriever must not bypass the model's abstention.
    def no_rag(*args, **kwargs): pytest.fail("Abstention must suppress secondary repair retrieval")
    monkeypatch.setattr(api.rag_service, "rag_pipeline", no_rag)
    body = analyze(client, request, context, token)
    assert not body["reference_found"] and not body["recommended_solution"]
    assert body["troubleshooting_steps"] == [] and not body["rag_sources"]
    assert body["is_emergency"] and body["routing_target"] == "CLINICAL_TEAM"
    assert body["customer_support"]["status"] == ("OUT_OF_SCOPE" if token == "E" else "NEEDS_DETAILS")


@pytest.mark.parametrize("change", [{"description": "Battery low but there is a different new symptom"}, {"patient_connected": True}, {"customer_expertise": "EXPERT"}])
def test_changed_request_rejects_previous_selection(api_client, change):
    client, _, _ = api_client
    request, context = prepare(client)
    body = analyze(client, {**request, **change}, context)
    assert body["customer_support"]["status"] == "INVALID_RESULT"
    assert not body["reference_found"] and not body["recommended_solution"]


def test_modified_reference_invalidates_old_result(api_client):
    client, db, _ = api_client
    request, context = prepare(client)
    reference = db.query(FaultReferenceRule).filter_by(rule_id=context["candidates"][0]["reference_id"]).one()
    reference.recommended_solution = "Updated reference content"; db.commit()
    body = analyze(client, request, context)
    assert body["customer_support"]["status"] == "INVALID_RESULT"
    assert not body["reference_found"]


def test_unlisted_reference_cannot_be_selected(api_client):
    client, _, _ = api_client
    request, context = prepare(client, "The enclosure hinge is broken")
    assert not context["candidates"]
    body = analyze(client, request, context)
    assert body["customer_support"]["status"] == "INVALID_RESULT"
    assert not body["recommended_solution"]


def test_unclear_category_cannot_authorize_repair_selection(api_client):
    client, _, _ = api_client
    request, context = prepare(client)
    body = analyze(client, request, context, category="H")
    assert body["customer_support"]["status"] == "NEEDS_DETAILS"
    assert body["customer_support"]["guards"] == ["CATEGORY_UNCLEAR"]
    assert not body["recommended_solution"]


def test_missing_reference_requests_details_and_specialist(api_client):
    client, _, _ = api_client
    request, context = prepare(client, "The enclosure hinge is broken")
    body = analyze(client, request, context, token="D", category="D")
    assert body["customer_support"]["status"] == "NO_REFERENCE"
    assert body["customer_support"]["questions"]
    assert body["routing_target"] == "BIOMEDICAL_ENGINEERING"


def test_support_failure_is_explicit_reference_fallback(api_client):
    client, _, _ = api_client
    request, context = prepare(client)
    body = analyze(client, request, context, status="error", output_token=None, error_code="input_too_long")
    assert body["customer_support"]["status"] == "FALLBACK"
    assert body["customer_support"]["method"] == "REFERENCE_RULES"
    assert body["customer_support"]["result"]["error_code"] == "input_too_long"


@pytest.mark.parametrize("field,value", [("match_status", "UNVERIFIED"), ("source", ""), ("manufacturer", "Another company"), ("model", "Other model")])
def test_candidate_guards_require_device_and_source(api_client, field, value):
    client, db, _ = api_client
    reference = db.query(FaultReferenceRule).filter_by(rule_id="HAM-C6-001").one()
    setattr(reference, field, value); db.commit()
    _, context = prepare(client)
    assert "HAM-C6-001" not in [c["reference_id"] for c in context["candidates"]]


def test_prepare_requires_authentication(api_client):
    from app.api.dependencies import get_current_active_user
    client, _, _ = api_client
    client.app.dependency_overrides.pop(get_current_active_user)
    response = client.post("/api/intelligent-support/prepare-support", json={"device_id": 901, "description": "Battery low warning"})
    assert response.status_code == 401


def test_disabled_local_path_does_not_expose_unverified_reference(api_client):
    from app.services.browser_llm_service import MANIFEST as LOCAL_MANIFEST
    client, db, _ = api_client
    db.query(FaultReferenceRule).update({"match_status": "UNVERIFIED"}); db.commit()
    response = client.post("/api/intelligent-support/analyze-fault", json={
        "device_id": 901, "description": "Battery low warning",
        "browser_llm": {"status": "disabled", "revision": LOCAL_MANIFEST["revision"], "latency_ms": 0},
    })
    assert response.status_code == 200
    assert not response.json()["reference_found"] and not response.json()["recommended_solution"]


def test_client_cannot_supply_repair_text(api_client):
    client, _, _ = api_client
    request, context = prepare(client)
    local = payload(request["description"])
    local["support"] = {"status": "success", "version": context["version"], "input_sha256": context["input_sha256"],
                        "output_token": "A", "repair_text": "Untrusted repair"}
    response = client.post("/api/intelligent-support/analyze-fault", json={**request, "browser_llm": local})
    assert response.status_code == 422

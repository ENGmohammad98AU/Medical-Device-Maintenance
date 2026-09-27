"""Catalogue migration and LLM-only source boundaries; inference is not mocked as accuracy."""
import json
from collections import Counter

import pytest

from app.models.audit_log import AuditLog
from app.models.fault_reference_rule import FaultReferenceRule
from app.services.browser_llm_service import MANIFEST, browser_input_hash
from app.services.fault_reference_lookup_service import FaultReferenceLookupService
from app.services.llm_reference_context import (
    CATALOGUE_PATH, CONTEXT_PATH, RETIRED_CATALOGUE_IDS, load_llm_context,
)
from app.services.llm_triage_service import LLMRun
from test_device_support_regressions import three_devices, analyze
from test_llm_triage import api_client


def test_original_39_faults_are_separate_from_llm_context():
    catalogue = json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))
    assert len(catalogue) == 39
    assert Counter(row["model"] for row in catalogue) == {"C6": 12, "MX800": 12, "Perfusor Space": 15}
    assert not {row["rule_id"] for row in catalogue} & RETIRED_CATALOGUE_IDS
    assert {row["reference_id"] for row in load_llm_context()} == RETIRED_CATALOGUE_IDS


def test_upgrade_removes_six_catalogue_additions_and_preserves_audits(three_devices):
    client, db, _ = three_devices
    body, _ = analyze(client, 902, "Resp LEADS OFF", "B", "PH-MX800-013")
    audit_id = body["audit_log_id"]
    audit_before = json.dumps(db.get(AuditLog, audit_id).classification_result, sort_keys=True)
    service = FaultReferenceLookupService(db)
    db.add_all(service._model_from_record(row["reference_id"], row) for row in load_llm_context())
    db.commit()
    assert db.query(FaultReferenceRule).count() == 45
    for _ in range(2):
        assert service.load_rules_from_json(str(CATALOGUE_PATH)) == 39
        assert db.query(FaultReferenceRule).count() == 39
    assert json.dumps(db.get(AuditLog, audit_id).classification_result, sort_keys=True) == audit_before
    assert db.query(AuditLog).count() == 1


def test_migration_does_not_delete_unrelated_custom_records(three_devices):
    _, db, _ = three_devices
    service = FaultReferenceLookupService(db)
    original = json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))[0]
    db.add(service._model_from_record("CUSTOM-001", original))
    db.add_all(service._model_from_record(row["reference_id"], row) for row in load_llm_context())
    db.commit()
    service.load_rules_from_json(str(CATALOGUE_PATH))
    assert db.query(FaultReferenceRule).count() == 40
    assert db.query(FaultReferenceRule).filter_by(rule_id="CUSTOM-001").one()
    assert not db.query(FaultReferenceRule).filter(FaultReferenceRule.rule_id.in_(RETIRED_CATALOGUE_IDS)).count()


def test_context_file_cannot_be_imported_as_catalogue_rules(three_devices):
    _, db, _ = three_devices
    with pytest.raises(ValueError, match="Expected a list of rules"):
        FaultReferenceLookupService(db).load_rules_from_json(str(CONTEXT_PATH))
    assert db.query(FaultReferenceRule).count() == 39


@pytest.mark.parametrize("device_id,report,category,reference_id", [
    (901, "Low oxygen", "F", "HAM-C6-013"),
    (901, "Low pressure", "F", "HAM-C6-014"),
    (902, "Resp LEADS OFF", "B", "PH-MX800-013"),
    (902, "Resp Equip Malf", "B", "PH-MX800-014"),
    (902, "Resp Erratic", "B", "PH-MX800-015"),
    (903, "Standby time expired", "F", "BB-PS-016"),
])
def test_llm_selects_context_without_growing_catalogue(three_devices, device_id, report, category, reference_id):
    client, db, _ = three_devices
    body, _ = analyze(client, device_id, report, category, reference_id)
    assert body["reference_found"] and body["recommended_solution"] and body["reference_url"]
    assert body["customer_support"]["method"] == "LOCAL_LLM_CONTEXT_SELECTION"
    assert body["customer_support"]["reference_origin"] == "LLM_CONTEXT"
    assert body["customer_support"]["selected_reference_id"] == reference_id
    assert not body["customer_support"]["questions"]
    assert db.query(FaultReferenceRule).count() == 39
    assert not db.query(FaultReferenceRule).filter_by(rule_id=reference_id).first()


@pytest.mark.parametrize("mode", ["absent", "disabled", "support_error"])
def test_context_requires_successful_llm_selection(three_devices, monkeypatch, mode):
    client, db, api = three_devices
    request = {"device_id": 902, "description": "Resp LEADS OFF"}
    context = client.post('/api/intelligent-support/prepare-support', json=request).json()
    assert context["candidates"][0]["reference_id"] == "PH-MX800-013"
    class DisabledModel:
        def classify(self, **kwargs): return LLMRun(status="disabled")
    monkeypatch.setattr(api, "llm_service", DisabledModel())
    def no_rag(*args, **kwargs): pytest.fail("LLM-only context cannot use a secondary fallback")
    monkeypatch.setattr(api.rag_service, "rag_pipeline", no_rag)
    if mode == "disabled":
        request["browser_llm"] = {"status": "disabled", "revision": MANIFEST["revision"]}
    elif mode == "support_error":
        request["browser_llm"] = {
            "status": "success", "revision": MANIFEST["revision"], "prompt_version": MANIFEST["prompt_version"],
            "output_token": "B", "input_sha256": browser_input_hash(request["description"], "PATIENT_MONITOR", False),
            "support": {"status": "error", "version": context["version"],
                        "input_sha256": context["input_sha256"], "error_code": "timeout"},
        }
    response = client.post('/api/intelligent-support/analyze-fault', json=request)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["customer_support"]["status"] == "LLM_REQUIRED"
    assert body["routing_target"] == "BIOMEDICAL_ENGINEERING"
    assert body["severity"] == "HIGH"
    assert not body["reference_found"] and not body["recommended_solution"]
    assert not body["troubleshooting_steps"] and not body["rag_sources"]
    assert db.query(FaultReferenceRule).count() == 39


def test_unclear_category_does_not_authorize_context_guidance(three_devices):
    client, _, _ = three_devices
    body, _ = analyze(client, 902, "Resp LEADS OFF", "H", "PH-MX800-013")
    assert not body["reference_found"] and not body["recommended_solution"]
    assert "CATEGORY_UNCLEAR" in body["customer_support"]["guards"]
    assert body["severity"] == "HIGH"

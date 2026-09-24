"""Regression coverage for the public ticket lifecycle, not model accuracy."""
import pytest
from app.api.fault_reports import router
from app.models.audit_log import AuditLog
from app.models.fault_report import FaultReport, FaultStatus
from app.repositories.fault_report import FaultReportRepository
from test_llm_triage import api_client

@pytest.fixture
def reports_client(api_client):
    client, db, _ = api_client
    client.app.include_router(router)
    return client, db

def create(client, text="Battery does not hold charge after disconnecting mains power"):
    response = client.post("/api/fault-reports/", json={"device_id":901,"error_message":text,"description":text})
    assert response.status_code == 201, response.text
    return response.json()["id"]

def analyze(client, report_id, text="Battery does not hold charge after disconnecting mains power"):
    response = client.post("/api/intelligent-support/analyze-fault", json={"device_id":901,"report_id":report_id,"description":text})
    assert response.status_code == 200, response.text
    return response.json()["audit_log_id"]

def decide(client, audit_id, decision="APPROVED"):
    response = client.post(f"/api/intelligent-support/audit-logs/{audit_id}/decision",params={"decision":decision,"comments":"Reviewed by the engineer"})
    assert response.status_code == 200, response.text

def verify(client, report_id, **overrides):
    return client.post(f"/api/fault-reports/{report_id}/verify-resolution",json={
        "action_taken":"Performed the approved reference procedure",
        "verification_result":"Functional checks completed without recurrence",
        "outcome":"RESOLVED",**overrides})

def test_no_closure_bypass_through_update_or_legacy_resolve(reports_client):
    client, db = reports_client
    report_id = create(client)
    original = db.get(FaultReport,report_id).description
    assert client.put(f"/api/fault-reports/{report_id}",json={"status":"resolved","description":"Should not be persisted"}).status_code == 409
    assert client.post(f"/api/fault-reports/{report_id}/resolve").status_code == 409
    with pytest.raises(ValueError):
        FaultReportRepository(db).resolve(report_id,900)
    db.expire_all()
    report = db.get(FaultReport,report_id)
    assert report.description == original and report.status == FaultStatus.OPEN
    assert report.resolved_at is None

@pytest.mark.parametrize("field,value",[("action_taken","   "),("verification_result"," \n\t "),("action_taken"," a "),("verification_result"," ab ")])
def test_blank_or_short_evidence_never_closes_ticket(reports_client,field,value):
    client, db = reports_client
    report_id = create(client)
    decide(client,analyze(client,report_id))
    assert verify(client,report_id,**{field:value}).status_code == 422
    db.expire_all()
    assert db.get(FaultReport,report_id).status == FaultStatus.IN_PROGRESS
    workflow = client.get(f"/api/fault-reports/{report_id}/workflow").json()
    assert workflow["verified_at"] is None and workflow["outcome"] == "PENDING"

@pytest.mark.parametrize("decision",["REJECTED","ESCALATED"])
def test_unapproved_recommendation_cannot_be_recorded_as_solved(reports_client,decision):
    client,_ = reports_client
    report_id = create(client)
    decide(client,analyze(client,report_id),decision)
    assert verify(client,report_id).status_code == 422
    assert verify(client,report_id,outcome="FOLLOW_UP").status_code == 200

def test_closed_ticket_requires_reopen_new_analysis_and_new_decision(reports_client):
    client,db = reports_client
    report_id = create(client)
    audit_id = analyze(client,report_id)
    decide(client,audit_id)
    closed = verify(client,report_id)
    assert closed.status_code == 200,closed.text
    assert client.post(f"/api/fault-reports/{report_id}/resolve").status_code == 200
    count = db.query(AuditLog).count()
    for endpoint in ("prepare-support","analyze-fault"):
        blocked = client.post(f"/api/intelligent-support/{endpoint}",json={"device_id":901,"report_id":report_id,"description":"Battery problem recurred after verification"})
        assert blocked.status_code == 409,blocked.text
    assert db.query(AuditLog).count() == count
    assert verify(client,report_id).status_code == 422
    assert client.put(f"/api/fault-reports/{report_id}",json={"status":"open"}).status_code == 409
    assert client.post(f"/api/fault-reports/{report_id}/reopen",json={"reason":"  "}).status_code == 422
    reopened = client.post(f"/api/fault-reports/{report_id}/reopen",json={"reason":"Symptom recurred"})
    assert reopened.status_code == 200,reopened.text
    current = reopened.json()
    assert current["outcome"] == "NEEDS_ANALYSIS"
    assert current["audit_log_id"] is None and current["specialist_decision"] is None
    assert current["action_taken"] is None and current["verified_at"] is None
    assert current["selected_reference_id"] is None
    assert verify(client,report_id).status_code == 422
    events = db.get(AuditLog,audit_id).classification_result["resolution_events"]
    old_cycle = next(event for event in events if event["event"] == "REOPENED")
    assert old_cycle["workflow"]["outcome"] == "RESOLVED"
    assert old_cycle["workflow"]["verification_result"] == closed.json()["verification_result"]
    assert old_cycle["reason"] == "Symptom recurred"
    new_audit_id = analyze(client,report_id)
    assert new_audit_id != audit_id
    assert verify(client,report_id).status_code == 422
    decide(client,new_audit_id)
    assert verify(client,report_id).status_code == 200

def test_changed_context_invalidates_approval_and_updates_canonical_report(reports_client):
    client,db = reports_client
    report_id = create(client)
    decide(client,analyze(client,report_id))
    assert client.put(f"/api/fault-reports/{report_id}",json={"error_message":"Display freezes while mains power is stable"}).status_code == 200
    assert verify(client,report_id).status_code == 422
    workflow = client.get(f"/api/fault-reports/{report_id}/workflow").json()
    assert workflow["outcome"] == "NEEDS_ANALYSIS" and workflow["specialist_decision"] is None
    assert workflow["selected_reference_id"] is None
    clarified = "The display freezes after startup; no battery fault is observed"
    audit_id = analyze(client,report_id,clarified)
    db.expire_all()
    report = db.get(FaultReport,report_id)
    assert report.error_message == clarified and report.description == clarified
    assert report.status == FaultStatus.IN_PROGRESS
    assert verify(client,report_id).status_code == 422
    decide(client,audit_id)
    assert verify(client,report_id).status_code == 200

def test_reanalysis_clears_rejection_and_stale_decision(reports_client):
    client,db = reports_client
    report_id = create(client)
    decide(client,analyze(client,report_id),"REJECTED")
    analyze(client,report_id,"Battery loses charge immediately after power is disconnected")
    db.expire_all()
    assert db.get(FaultReport,report_id).status == FaultStatus.IN_PROGRESS
    assert client.get(f"/api/fault-reports/{report_id}/workflow").json()["specialist_decision"] is None
    assert verify(client,report_id).status_code == 422
    assert client.put(f"/api/fault-reports/{report_id}",json={"status":"open"}).status_code == 409

@pytest.mark.parametrize("length",[501,2001,4000])
def test_create_and_update_share_4000_character_limit(reports_client,length):
    client,_ = reports_client
    report_id = create(client,"x"*length)
    response = client.put(f"/api/fault-reports/{report_id}",json={"error_message":"y"*length,"description":"y"*length})
    assert response.status_code == 200,response.text
    assert len(response.json()["error_message"]) == length

@pytest.mark.parametrize("value",["x"*4001,"   ",None])
def test_invalid_description_cannot_be_saved(reports_client,value):
    client,_ = reports_client
    report_id = create(client)
    assert client.post("/api/fault-reports/",json={"device_id":901,"error_message":value}).status_code == 422
    assert client.put(f"/api/fault-reports/{report_id}",json={"error_message":value}).status_code == 422

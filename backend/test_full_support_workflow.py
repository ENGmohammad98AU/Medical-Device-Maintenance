"""Regression tests for the complete LLM-to-resolution research workflow."""

import pytest

from app.models.fault_report import FaultReport, FaultSeverity, FaultStatus
from app.services.evaluation_service import EvaluationService
from app.services.fault_resolution_workflow_service import FaultResolutionWorkflowService
from test_llm_triage import api_client


def create_report(db):
    report = FaultReport(
        device_id=901,
        reported_by=1,
        error_message="The casing hinge detached during routine inspection",
        description="The casing hinge detached during routine inspection",
        severity=FaultSeverity.MEDIUM,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def test_analysis_decision_execution_verification_and_reopen_are_linked(api_client):
    client, db, _ = api_client
    report = create_report(db)

    response = client.post("/api/intelligent-support/analyze-fault", json={
        "device_id": 901,
        "report_id": report.id,
        "description": report.description,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["workflow"]["fault_report_id"] == report.id
    assert body["workflow"]["audit_log_id"] == body["audit_log_id"]
    assert body["workflow"]["classification_source"] == body["classification_source"]

    decision = client.post(
        f"/api/intelligent-support/audit-logs/{body['audit_log_id']}/decision",
        params={"decision": "APPROVED", "comments": "Expert review completed"},
    )
    assert decision.status_code == 200, decision.text

    service = FaultResolutionWorkflowService(db)
    workflow = service.get(report.id)
    assert workflow.specialist_decision == "APPROVED"
    assert workflow.decision_by is not None
    assert workflow.decision_by == int(decision.json().get("reviewed_by", workflow.decision_by))

    verified = service.verify_resolution(
        report.id,
        action_taken="Inspected and completed the approved reference-guided action",
        verification_result="Functional verification completed without recurrence",
        outcome="RESOLVED",
        user_id=1,
    )
    db.refresh(report)
    assert verified.outcome == "RESOLVED"
    assert report.status == FaultStatus.RESOLVED
    assert report.resolved_at is not None

    reopened = service.reopen(report.id, reason="Symptom recurred during follow-up", user_id=1)
    db.refresh(report)
    assert reopened.outcome == "NEEDS_ANALYSIS"
    assert report.status == FaultStatus.IN_PROGRESS
    assert report.resolved_at is None


def test_resolution_requires_analysis_and_human_decision(api_client):
    _, db, _ = api_client
    report = create_report(db)
    service = FaultResolutionWorkflowService(db)

    with pytest.raises(ValueError, match="Analyze"):
        service.verify_resolution(
            report.id,
            action_taken="Attempted action",
            verification_result="Observed result",
            outcome="RESOLVED",
            user_id=1,
        )


def test_multiclass_category_metrics_measure_actual_llm_categories(api_client):
    _, db, _ = api_client
    evaluation = EvaluationService(db)
    evaluation.add_category_label("1", "POWER", "POWER")
    evaluation.add_category_label("2", "POWER", "SENSOR")
    evaluation.add_category_label("3", "SENSOR", "SENSOR")

    metrics = EvaluationService(db).calculate_category_metrics()
    assert metrics.support == 3
    assert metrics.accuracy == pytest.approx(2 / 3)
    assert metrics.macro_precision == pytest.approx(0.75)
    assert metrics.macro_recall == pytest.approx(0.75)
    assert metrics.macro_f1 == pytest.approx(2 / 3)
    assert set(metrics.per_class) == {"POWER", "SENSOR"}

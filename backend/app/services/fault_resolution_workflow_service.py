"""Business logic for the complete fault-resolution lifecycle."""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.fault_report import FaultReport, FaultSeverity, FaultStatus
from app.models.fault_resolution_workflow import FaultResolutionWorkflow


ALLOWED_DECISIONS = {"APPROVED", "MODIFIED", "ESCALATED", "REJECTED"}
ALLOWED_OUTCOMES = {"RESOLVED", "FAILED", "FOLLOW_UP"}


class FaultResolutionWorkflowService:
    def __init__(self, db: Session):
        self.db = db

    def get(self, report_id: int) -> Optional[FaultResolutionWorkflow]:
        return (
            self.db.query(FaultResolutionWorkflow)
            .filter(FaultResolutionWorkflow.fault_report_id == report_id)
            .first()
        )

    def _get_report(self, report_id: int) -> Optional[FaultReport]:
        return self.db.query(FaultReport).filter(FaultReport.id == report_id).first()

    def _get_or_create(self, report_id: int) -> FaultResolutionWorkflow:
        workflow = self.get(report_id)
        if workflow:
            return workflow
        workflow = FaultResolutionWorkflow(fault_report_id=report_id)
        self.db.add(workflow)
        self.db.flush()
        return workflow

    def record_analysis(
        self,
        report_id: int,
        *,
        audit_log_id: str,
        classification_source: str,
        fault_category: Optional[str],
        routing_target: str,
        llm_status: str,
        llm_provider: Optional[str],
        llm_model: Optional[str],
        llm_revision: Optional[str],
        llm_latency_ms: float,
        total_processing_time_ms: float,
        selected_reference_id: Optional[str],
        reference_source: str,
        recommended_solution: str,
        verification_instructions: str,
        severity: str,
    ) -> FaultResolutionWorkflow:
        report = self._get_report(report_id)
        if report is None:
            raise ValueError("Fault report not found")

        workflow = self._get_or_create(report_id)
        previous_audit_log_id = workflow.audit_log_id
        if previous_audit_log_id and previous_audit_log_id != audit_log_id:
            # A new analysis supersedes the old recommendation. Human approval,
            # execution evidence and verification must be collected again.
            workflow.specialist_decision = None
            workflow.specialist_comments = None
            workflow.decision_by = None
            workflow.decision_at = None
            workflow.action_taken = None
            workflow.verification_result = None
            workflow.verified_by = None
            workflow.verified_at = None
        workflow.audit_log_id = audit_log_id
        workflow.classification_source = classification_source
        workflow.fault_category = fault_category
        workflow.routing_target = routing_target
        workflow.llm_status = llm_status
        workflow.llm_provider = llm_provider
        workflow.llm_model = llm_model
        workflow.llm_revision = llm_revision
        workflow.llm_latency_ms = float(llm_latency_ms or 0.0)
        workflow.total_processing_time_ms = float(total_processing_time_ms or 0.0)
        workflow.selected_reference_id = selected_reference_id
        workflow.reference_source = reference_source or ""
        workflow.recommended_solution = recommended_solution or ""
        workflow.verification_instructions = verification_instructions or ""
        workflow.outcome = "PENDING"

        normalized_severity = (severity or "").lower()
        if normalized_severity in FaultSeverity._value2member_map_:
            report.severity = FaultSeverity(normalized_severity)
        if report.status == FaultStatus.OPEN:
            report.status = FaultStatus.IN_PROGRESS

        self.db.commit()
        self.db.refresh(workflow)
        return workflow

    def record_specialist_decision(
        self,
        report_id: int,
        *,
        decision: str,
        comments: Optional[str],
        user_id: int,
    ) -> FaultResolutionWorkflow:
        decision = decision.strip().upper()
        if decision not in ALLOWED_DECISIONS:
            raise ValueError("Invalid specialist decision")
        workflow = self.get(report_id)
        if workflow is None:
            raise ValueError("Analyze the fault report before recording a decision")
        workflow.specialist_decision = decision
        workflow.specialist_comments = comments
        workflow.decision_by = user_id
        workflow.decision_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(workflow)
        return workflow

    def record_specialist_decision_by_audit(
        self,
        audit_log_id: str,
        *,
        decision: str,
        comments: Optional[str],
        user_id: int,
    ) -> Optional[FaultResolutionWorkflow]:
        workflow = (
            self.db.query(FaultResolutionWorkflow)
            .filter(FaultResolutionWorkflow.audit_log_id == audit_log_id)
            .first()
        )
        if workflow is None:
            return None
        return self.record_specialist_decision(
            workflow.fault_report_id,
            decision=decision,
            comments=comments,
            user_id=user_id,
        )

    def verify_resolution(
        self,
        report_id: int,
        *,
        action_taken: str,
        verification_result: str,
        outcome: str,
        user_id: int,
    ) -> FaultResolutionWorkflow:
        outcome = outcome.strip().upper()
        if outcome not in ALLOWED_OUTCOMES:
            raise ValueError("Invalid resolution outcome")
        workflow = self.get(report_id)
        report = self._get_report(report_id)
        if workflow is None or report is None:
            raise ValueError("Analyze the fault report before verifying the outcome")
        if not workflow.specialist_decision:
            raise ValueError("A specialist decision is required before recording the executed solution")
        if workflow.specialist_decision == "REJECTED" and outcome == "RESOLVED":
            raise ValueError("A rejected recommendation cannot be marked resolved without a new analysis or decision")

        workflow.action_taken = action_taken.strip()
        workflow.verification_result = verification_result.strip()
        workflow.outcome = outcome
        workflow.verified_by = user_id
        workflow.verified_at = datetime.utcnow()

        if outcome == "RESOLVED":
            report.status = FaultStatus.RESOLVED
            report.resolved_at = workflow.verified_at
            report.resolved_by = user_id
        else:
            report.status = FaultStatus.IN_PROGRESS
            report.resolved_at = None
            report.resolved_by = None

        self.db.commit()
        self.db.refresh(workflow)
        return workflow

    def reopen(self, report_id: int, *, reason: str, user_id: int) -> FaultResolutionWorkflow:
        workflow = self.get(report_id)
        report = self._get_report(report_id)
        if workflow is None or report is None:
            raise ValueError("Fault workflow not found")
        workflow.outcome = "FOLLOW_UP"
        workflow.reopen_reason = reason.strip()
        workflow.reopened_by = user_id
        workflow.reopened_at = datetime.utcnow()
        report.status = FaultStatus.IN_PROGRESS
        report.resolved_at = None
        report.resolved_by = None
        self.db.commit()
        self.db.refresh(workflow)
        return workflow

    @staticmethod
    def to_dict(workflow: FaultResolutionWorkflow) -> dict:
        return {
            "id": workflow.id,
            "fault_report_id": workflow.fault_report_id,
            "audit_log_id": workflow.audit_log_id,
            "classification_source": workflow.classification_source,
            "fault_category": workflow.fault_category,
            "routing_target": workflow.routing_target,
            "llm_status": workflow.llm_status,
            "llm_provider": workflow.llm_provider,
            "llm_model": workflow.llm_model,
            "llm_revision": workflow.llm_revision,
            "llm_latency_ms": workflow.llm_latency_ms,
            "total_processing_time_ms": workflow.total_processing_time_ms,
            "selected_reference_id": workflow.selected_reference_id,
            "reference_source": workflow.reference_source,
            "recommended_solution": workflow.recommended_solution,
            "verification_instructions": workflow.verification_instructions,
            "specialist_decision": workflow.specialist_decision,
            "specialist_comments": workflow.specialist_comments,
            "decision_by": workflow.decision_by,
            "decision_at": workflow.decision_at,
            "action_taken": workflow.action_taken,
            "verification_result": workflow.verification_result,
            "outcome": workflow.outcome,
            "verified_by": workflow.verified_by,
            "verified_at": workflow.verified_at,
            "reopen_reason": workflow.reopen_reason,
            "reopened_by": workflow.reopened_by,
            "reopened_at": workflow.reopened_at,
            "created_at": workflow.created_at,
            "updated_at": workflow.updated_at,
        }

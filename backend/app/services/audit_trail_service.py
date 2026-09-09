"""Persistent audit trail service backed by SQLAlchemy."""

from typing import Dict, List, Optional, Any
from datetime import datetime
from uuid import uuid4
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.audit_log import AuditLog


class AuditTrailService:
    """Maintain an auditable, restart-safe record of system decisions."""

    def __init__(self, db: Session):
        self.db = db

    def create_log_entry(
        self,
        user_id: str,
        user_role: str,
        action: str,
        original_input: str,
        cleaned_input: str,
        extracted_entities: Dict[str, Any],
        classification_result: Dict[str, Any],
        retrieved_chunks: List[str],
        retrieval_scores: List[float],
        sources: List[str],
        generated_response: str,
        confidence_score: float,
        safety_check_result: Dict[str, Any],
        processing_time_ms: float,
        requires_review: bool,
    ) -> AuditLog:
        entry = AuditLog(
            id=f"AUDIT_{uuid4().hex}",
            timestamp=datetime.utcnow(),
            user_id=str(user_id),
            user_role=str(user_role),
            action=action,
            original_input=original_input,
            cleaned_input=cleaned_input,
            extracted_entities=extracted_entities or {},
            classification_result=classification_result or {},
            retrieved_chunks=retrieved_chunks or [],
            retrieval_scores=retrieval_scores or [],
            sources=sources or [],
            generated_response=generated_response or "",
            confidence_score=float(confidence_score or 0.0),
            safety_check_result=safety_check_result or {},
            processing_time_ms=float(processing_time_ms or 0.0),
            requires_review=bool(requires_review),
            review_status="PENDING" if requires_review else "AUTO_APPROVED",
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def add_engineer_decision(self, log_id: str, decision: str, comments: Optional[str] = None) -> Optional[AuditLog]:
        entry = self.get_log_entry(log_id)
        if not entry:
            return None
        entry.engineer_decision = decision
        entry.engineer_comments = comments
        entry.decision_timestamp = datetime.utcnow()
        entry.review_status = "REVIEWED"
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def get_log_entry(self, log_id: str) -> Optional[AuditLog]:
        return self.db.query(AuditLog).filter(AuditLog.id == log_id).first()

    def get_all_logs(self, limit: int = 100) -> List[AuditLog]:
        return self.db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()

    def get_user_logs(self, user_id: str, limit: int = 100) -> List[AuditLog]:
        return (
            self.db.query(AuditLog)
            .filter(AuditLog.user_id == str(user_id))
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .all()
        )

    def get_logs_by_date_range(self, start_date: datetime, end_date: datetime, limit: int = 100) -> List[AuditLog]:
        return (
            self.db.query(AuditLog)
            .filter(AuditLog.timestamp >= start_date, AuditLog.timestamp <= end_date)
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .all()
        )

    def get_pending_reviews(self) -> List[AuditLog]:
        return (
            self.db.query(AuditLog)
            .filter(AuditLog.review_status == "PENDING")
            .order_by(AuditLog.timestamp.asc())
            .all()
        )

    def get_statistics(self) -> Dict[str, Any]:
        total_logs = self.db.query(func.count(AuditLog.id)).scalar() or 0
        pending = self.db.query(func.count(AuditLog.id)).filter(AuditLog.review_status == "PENDING").scalar() or 0
        auto_approved = self.db.query(func.count(AuditLog.id)).filter(AuditLog.review_status == "AUTO_APPROVED").scalar() or 0
        reviewed = self.db.query(func.count(AuditLog.id)).filter(AuditLog.review_status == "REVIEWED").scalar() or 0
        avg_conf = self.db.query(func.avg(AuditLog.confidence_score)).scalar() or 0.0
        avg_time = self.db.query(func.avg(AuditLog.processing_time_ms)).scalar() or 0.0
        return {
            "total_logs": int(total_logs),
            "pending_reviews": int(pending),
            "auto_approved": int(auto_approved),
            "reviewed": int(reviewed),
            "average_confidence": round(float(avg_conf), 4),
            "average_processing_time": round(float(avg_time), 2),
        }

"""Reference-grounded fault analysis service.

The legacy endpoint keeps its historical schema, but the analysis is now backed
by the verified fault-reference database instead of demo/fixed output.
"""

from typing import Optional
from sqlalchemy.orm import Session
from app.schemas.fault_report import AIAnalysisResult
from app.models.device import Device
from app.models.fault_report import FaultSeverity
from app.services.fault_reference_lookup_service import FaultReferenceLookupService


class AIService:
    """Reference-grounded analysis for the legacy fault-report endpoint."""

    def __init__(self, db: Session):
        self.db = db

    def analyze_fault(self, device_id: int, alarm_code: Optional[str], error_message: str) -> AIAnalysisResult:
        device = self.db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise ValueError("Device not found")

        fault_query = (alarm_code or error_message or "").strip()
        description = (error_message or "").strip()
        result = FaultReferenceLookupService(self.db).lookup(
            device_query=device.name,
            fault_query=fault_query,
            description=description,
            manufacturer=device.manufacturer,
            model=device.model,
        )
        if not result.get("matched"):
            raise ValueError("لا توجد حالياً معلومات مرجعية كافية لتشخيص هذا العطل. يرجى إضافة المرجع الفني الخاص بالجهاز.")

        severity_text = str(result.get("severity") or "medium").lower()
        severity_map = {
            "low": FaultSeverity.LOW,
            "medium": FaultSeverity.MEDIUM,
            "high": FaultSeverity.HIGH,
            "critical": FaultSeverity.CRITICAL,
        }
        severity = severity_map.get(severity_text, FaultSeverity.MEDIUM)
        priority = {
            FaultSeverity.CRITICAL: "IMMEDIATE",
            FaultSeverity.HIGH: "HIGH",
            FaultSeverity.MEDIUM: "NORMAL",
            FaultSeverity.LOW: "LOW",
        }[severity]

        steps = result.get("troubleshooting_steps") or []
        initial_inspection = "\n".join(f"{idx + 1}. {step}" for idx, step in enumerate(steps))
        if not initial_inspection:
            initial_inspection = result.get("immediate_safety_action") or "Review the approved manufacturer reference before service action."

        references = []
        source = (result.get("source") or "").strip()
        page = (result.get("reference_page") or "").strip()
        url = (result.get("reference_url") or "").strip()
        if source:
            references.append(f"{source}{f' — page {page}' if page else ''}")
        if url:
            references.append(url)

        escalation = (
            "Escalate to a biomedical engineer and follow institutional safety procedure."
            if severity in {FaultSeverity.HIGH, FaultSeverity.CRITICAL}
            else "Biomedical engineering review is recommended before returning the device to service."
        )

        return AIAnalysisResult(
            device=device.name,
            manufacturer=device.manufacturer,
            model=device.model,
            alarm=result.get("matched_fault") or fault_query,
            department=device.department,
            severity=severity,
            confidence=int(round(float(result.get("match_confidence") or 0.0) * 100)),
            priority=priority,
            references=references,
            possible_cause=result.get("possible_causes") or "",
            initial_inspection=initial_inspection,
            escalation_recommendation=escalation,
            is_demo=False,
        )

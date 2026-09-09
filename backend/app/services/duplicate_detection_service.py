"""Persistent duplicate detection and recurring-fault analysis."""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.analysis_event import DuplicateReportRecord


@dataclass
class DuplicateReport:
    original_report_id: str
    duplicate_report_id: str
    similarity_score: float
    matched_fields: List[str]
    time_difference: timedelta


@dataclass
class RecurringFault:
    device_type: str
    fault_type: str
    occurrence_count: int
    time_period: str
    affected_devices: List[str]
    affected_departments: List[str]
    pattern_description: str
    recommended_action: str


class DuplicateDetectionService:
    def __init__(self, db: Session):
        self.db = db
        self.similarity_threshold = 0.8
        self.time_threshold_hours = 24

    @staticmethod
    def _to_dict(row: DuplicateReportRecord) -> Dict[str, Any]:
        return {
            'report_id': row.report_id,
            'timestamp': row.timestamp,
            'device_type': row.device_type,
            'error_message': row.error_message,
            'error_code': row.error_code,
            'department': row.department,
            'model': row.model,
            'fault_type': row.fault_type,
            'device_id': row.device_identifier,
        }

    def add_report(self, report_id: str, report_data: Dict[str, Any]):
        existing = self.db.query(DuplicateReportRecord).filter(DuplicateReportRecord.report_id == report_id).first()
        if existing:
            return existing
        row = DuplicateReportRecord(
            report_id=report_id,
            timestamp=datetime.utcnow(),
            device_type=report_data.get('device_type'),
            error_message=report_data.get('error_message'),
            error_code=report_data.get('error_code'),
            department=report_data.get('department'),
            model=report_data.get('model'),
            fault_type=report_data.get('fault_type'),
            device_identifier=str(report_data.get('device_id')) if report_data.get('device_id') is not None else None,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def check_duplicate(self, report_data: Dict[str, Any]) -> Optional[DuplicateReport]:
        cutoff = datetime.utcnow() - timedelta(hours=self.time_threshold_hours)
        rows = self.db.query(DuplicateReportRecord).filter(DuplicateReportRecord.timestamp >= cutoff).all()
        best_match = None
        best_score = 0.0
        for row in rows:
            existing_data = self._to_dict(row)
            time_diff = datetime.utcnow() - row.timestamp
            similarity, matched_fields = self._calculate_similarity(report_data, existing_data)
            if similarity > best_score and similarity >= self.similarity_threshold:
                best_score = similarity
                best_match = DuplicateReport(
                    original_report_id=row.report_id,
                    duplicate_report_id=report_data.get('report_id', 'new'),
                    similarity_score=similarity,
                    matched_fields=matched_fields,
                    time_difference=time_diff,
                )
        return best_match

    def _calculate_similarity(self, report1: Dict[str, Any], report2: Dict[str, Any]) -> tuple:
        matched_fields: List[str] = []
        weighted_scores: List[float] = []

        if report1.get('device_type') and report1.get('device_type') == report2.get('device_type'):
            matched_fields.append('device_type'); weighted_scores.append(1.0)
        if report1.get('error_message') and report2.get('error_message'):
            score = SequenceMatcher(None, report1['error_message'].lower(), report2['error_message'].lower()).ratio()
            if score > 0.7:
                matched_fields.append('error_message'); weighted_scores.append(score)
        if report1.get('error_code') and report1.get('error_code') == report2.get('error_code'):
            matched_fields.append('error_code'); weighted_scores.append(1.0)
        if report1.get('department') and report1.get('department') == report2.get('department'):
            matched_fields.append('department'); weighted_scores.append(0.5)
        if report1.get('model') and report1.get('model') == report2.get('model'):
            matched_fields.append('model'); weighted_scores.append(0.5)

        return (sum(weighted_scores) / len(weighted_scores) if weighted_scores else 0.0), matched_fields

    def analyze_recurring_faults(self, time_period_days: int = 30) -> List[RecurringFault]:
        cutoff = datetime.utcnow() - timedelta(days=time_period_days)
        rows = self.db.query(DuplicateReportRecord).filter(DuplicateReportRecord.timestamp >= cutoff).all()
        fault_groups: Dict[str, List[Dict[str, Any]]] = {}
        for row in rows:
            report = self._to_dict(row)
            key = f"{report.get('device_type') or 'UNKNOWN'}|||{report.get('fault_type') or 'UNKNOWN'}"
            fault_groups.setdefault(key, []).append(report)

        recurring_faults: List[RecurringFault] = []
        for key, reports in fault_groups.items():
            if len(reports) < 3:
                continue
            device_type, fault_type = key.split('|||', 1)
            affected_devices = sorted({str(r.get('device_id') or 'UNKNOWN') for r in reports})
            affected_departments = sorted({str(r.get('department') or 'UNKNOWN') for r in reports})
            recurring_faults.append(RecurringFault(
                device_type=device_type,
                fault_type=fault_type,
                occurrence_count=len(reports),
                time_period=f"{time_period_days} days",
                affected_devices=affected_devices,
                affected_departments=affected_departments,
                pattern_description=f"Recurring {fault_type} on {device_type} devices detected {len(reports)} times in the specified period",
                recommended_action=self._generate_preventive_action(device_type, fault_type),
            ))
        return sorted(recurring_faults, key=lambda x: x.occurrence_count, reverse=True)

    def _generate_preventive_action(self, device_type: str, fault_type: str) -> str:
        actions = {
            'VENTILATOR': "Schedule preventive maintenance focusing on approved circuit, flow-sensor, valve, power, and gas-supply checks.",
            'PATIENT_MONITOR': "Schedule calibration and accessory/cable inspection according to the approved service documentation.",
            'SYRINGE_PUMP': "Inspect syringe recognition, occlusion behavior, battery condition, drive mechanics, and calibration according to the approved service documentation.",
        }
        return actions.get(device_type, f"Schedule preventive maintenance for {device_type} devices focusing on {fault_type} issues")

    def get_statistics(self) -> Dict[str, Any]:
        total = self.db.query(func.count(DuplicateReportRecord.id)).scalar() or 0
        device_rows = self.db.query(DuplicateReportRecord.device_type, func.count(DuplicateReportRecord.id)).group_by(DuplicateReportRecord.device_type).order_by(func.count(DuplicateReportRecord.id).desc()).limit(5).all()
        fault_rows = self.db.query(DuplicateReportRecord.fault_type, func.count(DuplicateReportRecord.id)).group_by(DuplicateReportRecord.fault_type).order_by(func.count(DuplicateReportRecord.id).desc()).limit(5).all()
        return {
            'total_reports': int(total),
            'duplicate_rate': 0.0,
            'most_common_devices': [{'device': k or 'UNKNOWN', 'count': c} for k, c in device_rows],
            'most_common_faults': [{'fault': k or 'UNKNOWN', 'count': c} for k, c in fault_rows],
        }

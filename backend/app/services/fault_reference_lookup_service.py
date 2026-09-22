"""
Permanent local medical-device troubleshooting reference lookup service.

The manufacturer-verified local rule database is the primary diagnostic reference.
Matching is intentionally conservative: device manufacturer/model must match when
available, and low-confidence text matches are rejected rather than guessed.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.models.fault_reference_rule import FaultReferenceRule


NO_MATCH = {
    "matched": False,
    "device": "",
    "matched_fault": "",
    "meaning": "",
    "severity": "",
    "possible_causes": "",
    "immediate_safety_action": "",
    "troubleshooting_steps": [],
    "recommended_solution": "",
    "verification_before_return_to_service": "",
    "source": "",
    "reference_url": "",
    "reference_page": "",
    "match_confidence": 0.0,
    "match_status": "NO_MATCH",
}


class FaultReferenceLookupService:
    """Import and conservatively match manufacturer fault-reference rules."""

    MATCH_THRESHOLD = 0.58

    def __init__(self, db: Optional[Session] = None):
        self.db = db or SessionLocal()

    @staticmethod
    def _text(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value).strip()

    @staticmethod
    def _clean(value: str) -> str:
        value = (value or "").casefold()
        # Normalize common Arabic spelling variants so a natural report such as
        # "أقطاب" can match a verified alias written as "اقطاب".  Diacritics
        # and tatweel are presentation characters and must not affect lookup.
        value = re.sub(r"[\u0640\u064b-\u065f\u0670]", "", value)
        value = value.translate(str.maketrans({
            "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي",
        }))
        value = re.sub(r"[^\w\u0600-\u06ff]+", " ", value)
        return re.sub(r"\s+", " ", value).strip()

    @staticmethod
    def _normalize_code(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", (value or "").casefold())

    @classmethod
    def _tokens(cls, value: str) -> set[str]:
        return {token for token in cls._clean(value).split() if len(token) > 1}

    @staticmethod
    def _serialize_aliases(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, list):
            return json.dumps([str(item).strip() for item in value if str(item).strip()], ensure_ascii=False)
        if isinstance(value, tuple):
            return json.dumps([str(item).strip() for item in value if str(item).strip()], ensure_ascii=False)
        return str(value).strip()

    def load_rules_from_json(
        self,
        json_path: str = "./reference_data/medical_device_fault_reference.json",
    ) -> int:
        """Upsert reference rules from JSON without inventing missing data."""
        path = Path(json_path)
        if not path.exists():
            print(f"No reference data found at {path}")
            return 0

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in {path}: {exc}") from exc

        records: Sequence[Dict[str, Any]]
        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict) and isinstance(payload.get("rules"), list):
            records = payload["rules"]
        else:
            raise ValueError("Expected a list of rules or an object with a top-level 'rules' list.")

        imported = 0
        for index, record in enumerate(records, start=1):
            rule_id = self._text(record.get("rule_id") or record.get("id") or record.get("RuleID"))
            if not rule_id:
                rule_id = f"REF-{index:04d}"

            existing = (
                self.db.query(FaultReferenceRule)
                .filter(FaultReferenceRule.rule_id == rule_id)
                .first()
            )
            if existing:
                self._apply_record(existing, record)
                self.db.add(existing)
            else:
                self.db.add(self._model_from_record(rule_id, record))
            imported += 1

        self.db.commit()
        return imported

    def _model_from_record(self, rule_id: str, record: Dict[str, Any]) -> FaultReferenceRule:
        return FaultReferenceRule(
            rule_id=rule_id,
            sheet_name=self._text(record.get("sheet_name") or record.get("sheet") or "جدول الأعطال"),
            device_id=self._text(record.get("device_id") or record.get("asset_id") or record.get("deviceAssetId")),
            device_name=self._text(record.get("device_name") or record.get("device") or record.get("asset_name") or record.get("العنوان")),
            manufacturer=self._text(record.get("manufacturer") or record.get("company") or record.get("المصنع")),
            model=self._text(record.get("model") or record.get("model_name") or record.get("الموديل")),
            device_type=self._text(record.get("device_type") or record.get("category") or record.get("نوع_الجهاز") or record.get("device_class")),
            fault_code=self._text(record.get("fault_code") or record.get("fault_code_id") or record.get("error_code") or record.get("رمز_العطل") or record.get("الكود")),
            alarm_code=self._text(record.get("alarm_code") or record.get("alarm") or record.get("رمز_الإنذار")),
            error_message=self._text(record.get("error_message") or record.get("message") or record.get("error") or record.get("رسالة_الخطأ")),
            description=self._text(record.get("description") or record.get("description_ar") or record.get("الوصف") or record.get("fault_description")),
            meaning=self._text(record.get("meaning") or record.get("meaning_ar") or record.get("المعنى") or record.get("fault_meaning")),
            severity=self._text(record.get("severity") or record.get("severity_level") or record.get("severity_ar") or record.get("الخطورة") or "UNKNOWN"),
            original_alarm_priority=self._text(record.get("original_alarm_priority") or record.get("alarm_priority") or record.get("الأولوية_الأصلية")),
            possible_causes=self._text(record.get("possible_causes") or record.get("causes") or record.get("الأسباب_المحتملة")),
            immediate_safety_action=self._text(record.get("immediate_safety_action") or record.get("safety_action") or record.get("إجراء_السلامة_الفوري")),
            troubleshooting_steps=self._text(record.get("troubleshooting_steps") or record.get("steps") or record.get("خطوات_العلاج")),
            recommended_solution=self._text(record.get("recommended_solution") or record.get("solution") or record.get("الحل_الموصى")),
            verification_before_return_to_service=self._text(record.get("verification_before_return_to_service") or record.get("verification") or record.get("التأكد_قبل_العودة")),
            source=self._text(record.get("source") or record.get("reference") or record.get("المصدر")),
            reference_url=self._text(record.get("reference_url") or record.get("url") or record.get("URL")),
            reference_page=self._text(record.get("reference_page") or record.get("page") or record.get("الصفحة")),
            aliases=self._serialize_aliases(record.get("aliases") or record.get("alias") or record.get("known_aliases")),
            match_confidence=float(record.get("match_confidence") or 0.0),
            match_status=self._text(record.get("match_status") or record.get("status") or "UNVERIFIED"),
        )

    def _apply_record(self, existing: FaultReferenceRule, record: Dict[str, Any]) -> None:
        updated = self._model_from_record(existing.rule_id, record)
        for column in (
            "sheet_name", "device_id", "device_name", "manufacturer", "model", "device_type",
            "fault_code", "alarm_code", "error_message", "description", "meaning", "severity",
            "original_alarm_priority", "possible_causes", "immediate_safety_action",
            "troubleshooting_steps", "recommended_solution",
            "verification_before_return_to_service", "source", "reference_url",
            "reference_page", "aliases", "match_confidence", "match_status",
        ):
            value = getattr(updated, column)
            if value not in (None, ""):
                setattr(existing, column, value)

    def lookup(
        self,
        device_query: str = "",
        fault_query: str = "",
        description: str = "",
        manufacturer: str = "",
        model: str = "",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Return the best verified reference match, or NO_MATCH when confidence is insufficient."""
        session = db or self.db
        normalized_description = self._clean(description)
        # The maintenance screen accepts one free-text problem description and
        # therefore does not always send a separate fault/error-code value.
        # Treat that description as the primary lookup query when ``fault_query``
        # is empty.  Previously the method returned NO_MATCH immediately in this
        # common path, even though the bundled reference database contained an
        # exact alias for the submitted description.
        normalized_fault = self._clean(fault_query) or normalized_description
        normalized_device = self._clean(device_query)

        if not normalized_fault:
            return dict(NO_MATCH)

        ranked: List[tuple[float, FaultReferenceRule]] = []
        for rule in session.query(FaultReferenceRule).all():
            score = self._score_rule(
                rule=rule,
                normalized_fault=normalized_fault,
                normalized_description=normalized_description,
                normalized_device=normalized_device,
                manufacturer=manufacturer,
                model=model,
            )
            if score >= 0:
                ranked.append((score, rule))

        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked:
            return dict(NO_MATCH)

        top_score, rule = ranked[0]
        payload = self._rule_payload(rule, top_score)
        if top_score < self.MATCH_THRESHOLD:
            # Do not expose a candidate rule when confidence is insufficient.
            # Returning its technical instructions could be mistaken for a diagnosis.
            no_match = dict(NO_MATCH)
            no_match["match_confidence"] = round(top_score, 3)
            no_match["match_status"] = "LOW_CONFIDENCE"
            return no_match

        payload["matched"] = True
        payload["match_status"] = "MATCHED"
        return payload

    def support_candidates(self, *, device_query: str, manufacturer: str, model: str,
                           device_type: str, description: str, fault_query: str = "") -> List[Dict[str, Any]]:
        """Shortlist sourced, device-bound references; the LLM may select or abstain.

        This deliberately retains the lexical threshold. A semantic choice cannot
        authorize a reference from another model or bypass missing source metadata.
        """
        ranked = []
        for rule in self.db.query(FaultReferenceRule).all():
            if rule.match_status != "VERIFIED_MANUFACTURER" or not rule.source or not rule.reference_url:
                continue
            if not rule.reference_url.startswith("https://") or not rule.recommended_solution:
                continue
            if self._clean(rule.device_type) != self._clean(device_type):
                continue
            if manufacturer and model:
                if self._clean(rule.manufacturer) != self._clean(manufacturer):
                    continue
                if self._normalize_code(rule.model) != self._normalize_code(model):
                    continue
            elif self._clean(rule.device_name) != self._clean(device_query):
                continue
            score = self._score_rule(rule, self._clean(fault_query or description),
                                     self._clean(description), self._clean(device_query), manufacturer, model)
            if score < self.MATCH_THRESHOLD:
                continue
            aliases = self._parse_aliases(rule.aliases)
            arabic = next((a for a in aliases if re.search(r"[\u0600-\u06ff]", a)), "")
            symptom = " / ".join(s for s in [rule.error_message or rule.description or rule.fault_code, arabic] if s)
            payload = self._rule_payload(rule, score)
            payload.update(matched=True, match_status="MATCHED", reference_id=rule.rule_id, symptom=symptom[:220])
            ranked.append((score, rule.rule_id, payload))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return [item[2] for item in ranked[:3]]

    def _rule_payload(self, rule: FaultReferenceRule, score: float) -> Dict[str, Any]:
        return {
            "matched": False,
            "device": self._text(rule.device_name),
            "matched_fault": self._text(rule.fault_code or rule.alarm_code or rule.error_message),
            "meaning": self._text(rule.meaning),
            "severity": self._text(rule.severity),
            "possible_causes": self._text(rule.possible_causes),
            "immediate_safety_action": self._text(rule.immediate_safety_action),
            "troubleshooting_steps": [
                line.strip()
                for line in self._text(rule.troubleshooting_steps).splitlines()
                if line.strip()
            ],
            "recommended_solution": self._text(rule.recommended_solution),
            "verification_before_return_to_service": self._text(rule.verification_before_return_to_service),
            "source": self._text(rule.source),
            "reference_url": self._text(rule.reference_url),
            "reference_page": self._text(rule.reference_page),
            "match_confidence": round(score, 3),
            "match_status": self._text(rule.match_status or "UNVERIFIED"),
        }

    def _score_rule(
        self,
        rule: FaultReferenceRule,
        normalized_fault: str,
        normalized_description: str,
        normalized_device: str,
        manufacturer: str,
        model: str,
    ) -> float:
        # Hard device guards: never diagnose a fault from another manufacturer/model.
        if manufacturer and rule.manufacturer:
            if self._clean(rule.manufacturer) != self._clean(manufacturer):
                return -1
        if model and rule.model:
            if self._normalize_code(rule.model) != self._normalize_code(model):
                return -1

        device_score = self._device_match_score(rule, normalized_device) if normalized_device else 1.0

        candidates = [
            self._clean(rule.fault_code),
            self._clean(rule.alarm_code),
            self._clean(rule.error_message),
            self._clean(rule.description),
        ]
        candidates.extend(self._parse_aliases(rule.aliases))
        candidates = [candidate for candidate in candidates if candidate]

        if not candidates:
            return -1

        # Exact/containment match receives the highest score. A one-token
        # free-text query is only allowed to match an exact alias/message; this
        # prevents generic words such as "battery", "sensor", or "alarm" from
        # selecting a specific troubleshooting procedure.
        text_score = 0.0
        query_tokens = self._tokens(normalized_fault)
        single_token_free_text = len(query_tokens) == 1 and not any(char.isdigit() for char in normalized_fault)
        for candidate in candidates:
            if normalized_fault == candidate:
                text_score = max(text_score, 1.0)
                continue
            if single_token_free_text:
                continue
            if len(candidate) >= 4 and (
                normalized_fault in candidate or candidate in normalized_fault
            ):
                text_score = max(text_score, 0.94)
            else:
                seq = SequenceMatcher(None, normalized_fault, candidate).ratio()
                candidate_tokens = self._tokens(candidate)
                overlap = 0.0
                if query_tokens and candidate_tokens:
                    shared_tokens = query_tokens & candidate_tokens
                    overlap = len(shared_tokens) / len(query_tokens | candidate_tokens)
                    # Extra context words in a maintenance report should not
                    # dilute a distinctive multi-token alarm phrase. Require at
                    # least two shared terms, then score how much of the trusted
                    # candidate phrase is covered by the report.
                    if len(shared_tokens) >= 2:
                        candidate_coverage = len(shared_tokens) / len(candidate_tokens)
                        text_score = max(text_score, candidate_coverage * 0.9)
                text_score = max(text_score, (seq * 0.65) + (overlap * 0.35))

        # Description is supporting context only; it must not override a weak fault match.
        description_score = 0.0
        if normalized_description:
            for candidate in candidates:
                seq = SequenceMatcher(None, normalized_description, candidate).ratio()
                desc_tokens = self._tokens(normalized_description)
                candidate_tokens = self._tokens(candidate)
                overlap = 0.0
                if desc_tokens and candidate_tokens:
                    overlap = len(desc_tokens & candidate_tokens) / len(desc_tokens | candidate_tokens)
                description_score = max(description_score, (seq * 0.35) + (overlap * 0.65))

        if text_score < 0.25:
            return -1

        total = (text_score * 0.78) + (device_score * 0.17) + (description_score * 0.05)
        return min(total, 1.0)

    def _device_match_score(self, rule: FaultReferenceRule, normalized_device: str) -> float:
        rule_device = self._clean(rule.device_name)
        if not rule_device:
            return 0.0
        if normalized_device == rule_device:
            return 1.0
        if normalized_device in rule_device or rule_device in normalized_device:
            return 0.9
        return SequenceMatcher(None, normalized_device, rule_device).ratio()

    def _parse_aliases(self, aliases: str) -> List[str]:
        if not aliases:
            return []
        try:
            data = json.loads(aliases)
            if isinstance(data, list):
                return [self._clean(str(value)) for value in data if str(value).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
        return [
            self._clean(part)
            for part in re.split(r"[,;\n]+", aliases)
            if part.strip()
        ]

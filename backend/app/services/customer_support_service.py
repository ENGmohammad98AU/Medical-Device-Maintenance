"""Local LLM reference selection with server-owned sources and explicit scope.

The browser result is a proposal, not proof of inference or of a repaired device.
The server reconstructs candidates so client-supplied repair text is never used.
"""
import hashlib
import json
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.services.fault_reference_lookup_service import FaultReferenceLookupService, NO_MATCH
from app.services.llm_triage_service import redact_report

MANIFEST = json.loads((Path(__file__).parent / "support_llm_manifest.json").read_text(encoding="utf-8"))
PROMPT_HASH = hashlib.sha256(json.dumps(MANIFEST, sort_keys=True).encode()).hexdigest()


class BrowserSupportResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    status: Literal["success", "error"]
    version: str = Field(max_length=80)
    input_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    output_token: Optional[Literal["A", "B", "C", "D", "E"]] = None
    latency_ms: float = Field(default=0, ge=0, le=1000000, allow_inf_nan=False)
    error_code: Optional[Literal["cancelled", "timeout", "unsupported_browser", "load_failed", "input_too_long", "invalid_output"]] = None

    @model_validator(mode="after")
    def check_status(self):
        if self.status == "success" and (self.output_token is None or self.error_code is not None):
            raise ValueError("Successful selection needs a token and no error")
        if self.status == "error" and (self.output_token is not None or self.error_code is None):
            raise ValueError("Failed selection needs an error and no token")
        return self


def prepare_support(request, device, db):
    device_type = device.type.value.upper().replace("-", "_").replace(" ", "_")
    report_text = f"{request.fault} {request.description}".strip()
    references = FaultReferenceLookupService(db).support_candidates(
        device_query=device.name, manufacturer=device.manufacturer, model=device.model,
        device_type=device_type, description=request.description, fault_query=request.fault,
    )
    context = {
        "version": MANIFEST["version"], "report_text": redact_report(report_text),
        "device_name": f"{device.name} ({device.manufacturer} {device.model})",
        "candidates": [{"label": "ABC"[i], "reference_id": r["reference_id"], "symptom": r["symptom"]}
                       for i, r in enumerate(references)],
    }
    # Includes complete reference content, device and patient/expertise context.
    # Detects stale data; an untrusted browser can still forge its own proposal.
    binding = {"context": context, "references": references, "report_text": report_text,
               "device_id": device.id, "patient_connected": request.patient_connected,
               "customer_expertise": request.customer_expertise, "prompt_sha256": PROMPT_HASH}
    context["input_sha256"] = hashlib.sha256(json.dumps(binding, ensure_ascii=False, sort_keys=True,
                                                       separators=(",", ":")).encode()).hexdigest()
    return context, references


def resolve_support(context, references, result, llm_run, fallback):
    """Return a server-owned reference, review metadata and fallback suppression."""
    metadata = {
        "status": "FALLBACK", "scope": "UNCONFIRMED", "method": "REFERENCE_RULES",
        "selected_reference_id": None, "candidate_ids": [r["reference_id"] for r in references],
        "message": "النتيجة الحالية من البحث المرجعي؛ لم تتوفر مشاركة صالحة للنموذج في اختيار الحل.",
        "guards": [],
        "questions": [], "requires_review": True, "client_reported": result is not None,
        "prompt_version": MANIFEST["version"], "prompt_sha256": PROMPT_HASH,
        "model": llm_run.model, "model_revision": llm_run.model_revision,
        "runtime": llm_run.runtime, "result": result.model_dump() if result else None,
    }
    if result is None or result.status != "success":
        return fallback, metadata, False
    if (llm_run.status != "success" or result.version != MANIFEST["version"]
            or result.input_sha256 != context["input_sha256"]):
        metadata.update(status="INVALID_RESULT", message="تغير سياق الطلب أو المراجع. أعد التحليل للحصول على اقتراح مرتبط بالبيانات الحالية.")
        return dict(NO_MATCH), metadata, True
    metadata["method"] = "LOCAL_LLM_REFERENCE_SELECTION"
    token = result.output_token
    if token in "ABC" and llm_run.browser_category == "UNKNOWN":
        token = "D"
        metadata["guards"].append("CATEGORY_UNCLEAR")
    if token in "ABC":
        index = "ABC".index(token)
        if index >= len(references):
            metadata.update(status="INVALID_RESULT", message="تعذر قبول المرجع المقترح. أعد وصف المشكلة أو اطلب مراجعة المختص.")
            return dict(NO_MATCH), metadata, True
        selected = references[index]
        metadata.update(status="SELECTED", scope="IN_SCOPE", selected_reference_id=selected["reference_id"],
                        message="اختار النموذج مرجعًا للأعراض المذكورة. الحل أدناه من نص المرجع ويتطلب اعتماد المختص.")
        return selected, metadata, True
    if token == "E":
        metadata.update(status="OUT_OF_SCOPE", scope="OUT_OF_SCOPE",
                        message="يبدو أن الطلب خارج نطاق الدعم الفني للأجهزة الطبية. وضّح إن كان يتعلق بعطل جهاز؛ أما العلاج أو الدواء فراجع الفريق السريري، والطلبات الإدارية تُوجّه إلى خدمة العملاء المختصة.")
    else:
        unclear = llm_run.browser_category == "UNKNOWN" or bool(references)
        metadata.update(status="NEEDS_DETAILS" if unclear else "NO_REFERENCE", scope="UNCONFIRMED" if unclear else "IN_SCOPE",
                        message="لم يختر النموذج حلًا مرجعيًا مناسبًا. أضف التفاصيل التالية أو أحل الطلب إلى مهندس الأجهزة الطبية.",
                        questions=["ما رسالة الخطأ أو رمز الإنذار كما يظهر على الجهاز؟",
                                   "متى بدأت المشكلة، وما السلوك الذي تلاحظه؟",
                                   "هل اسم الجهاز والمصنع والموديل المحدد صحيحة؟"])
    return dict(NO_MATCH), metadata, True

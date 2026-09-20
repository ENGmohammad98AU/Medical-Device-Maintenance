"""One real, billable provider call with synthetic device text only.

From backend: python scripts/smoke_test_llm.py
Requires AI_MODE=openai and OPENAI_API_KEY in backend/.env or the environment.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.llm_triage_service import LLMTriageService  # noqa: E402


def main():
    result = LLMTriageService().classify(
        report_text="The device battery is no longer charging when connected to mains power.",
        device_type="VENTILATOR", manufacturer="Hamilton Medical", model="C6",
        patient_connected=False, reference={},
    )
    print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    if result.status != "success":
        print("Live LLM call did not complete; check server configuration and provider access.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Conservative spelling normalization shared with the pinned browser manifest."""
import json
import re
from pathlib import Path

_SPELLING = json.loads((Path(__file__).with_name("browser_llm_manifest.json")).read_text(encoding="utf-8"))["report_spelling"]


def normalize_report_text(text: str) -> str:
    # Original input and binding hashes remain unchanged for traceability.
    return re.sub(r"\b[A-Za-z]+\b", lambda match: _SPELLING.get(match[0].lower(), match[0]), text.strip(), flags=re.ASCII)

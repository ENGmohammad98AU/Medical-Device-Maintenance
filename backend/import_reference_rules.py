"""CLI import helper for the extracted workbook JSON/CSV data.

Paste the extracted workbook data into:
backend/reference_data/medical_device_fault_reference.json

Then run:
python import_reference_rules.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database.connection import SessionLocal
from app.services.fault_reference_lookup_service import FaultReferenceLookupService


def main():
    db = SessionLocal()
    service = FaultReferenceLookupService(db)
    json_path = Path(__file__).resolve().parent / 'reference_data' / 'medical_device_fault_reference.json'
    if not json_path.exists():
        example = Path(__file__).resolve().parent / 'reference_data' / 'medical_device_fault_reference.example.json'
        print(f"Paste the extracted workbook JSON into {json_path}")
        print(f"Example file is available at {example}")
        return

    imported = service.load_rules_from_json(str(json_path))
    print(f"Imported {imported} fault reference rules into the local database.")


if __name__ == '__main__':
    main()

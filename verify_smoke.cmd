@echo off
cd /d c:\medical_app1_fixed_alignment\medical_app1
curl.exe -sS http://localhost:8000/openapi.json -o backend-openapi.json
curl.exe -sS http://localhost:5173 -o frontend-index.html
c:\medical_app1_fixed_alignment\medical_app1\backend\.venv\Scripts\python.exe -c "import json; from pathlib import Path; data=json.load(open('backend-openapi.json', encoding='utf-8')); print('backend_openapi=' + data.get('openapi', 'missing')); text=Path('frontend-index.html').read_text(encoding='utf-8'); print('frontend_root=' + str('<div id=\"root\"></div>' in text))"

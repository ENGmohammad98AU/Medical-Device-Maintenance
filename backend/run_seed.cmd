@echo off
cd /d c:\medical_app1_fixed_alignment\medical_app1\backend
.\.venv\Scripts\python.exe -c "from app.database.seed import seed_database; seed_database()"

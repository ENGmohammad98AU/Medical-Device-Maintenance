@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Starting BioMed Backend...
echo ==========================================

echo Clearing old process on port 8000...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :8000') do (
    taskkill /F /PID %%P >nul 2>&1
)

if exist ".venv\Scripts\python.exe" (
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else (
    echo ERROR: Backend virtual environment not found.
    echo Create it with:
    echo   python -m venv .venv
    echo   .\.venv\Scripts\Activate.ps1
    echo   pip install -r requirements.txt
    pause
    exit /b 1
)

pause

@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Starting BioMed AI Assistant Project
echo ==========================================

echo Clearing old processes on ports 8000 and 5173...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :8000') do (
    taskkill /F /PID %%P >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173') do (
    taskkill /F /PID %%P >nul 2>&1
)

start "Backend" cmd /k "cd /d ^"%~dp0backend^" && .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "Frontend" cmd /k "cd /d ^"%~dp0frontend^" && if not exist "node_modules" ( npm install ) && npm run dev -- --host 0.0.0.0 --port 5173"

echo Project started.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
pause

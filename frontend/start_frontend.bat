@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Starting BioMed Frontend...
echo ==========================================

echo Clearing old process on port 5173...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173') do (
    taskkill /F /PID %%P >nul 2>&1
)

if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
)

npm run dev -- --host 0.0.0.0 --port 5173
pause

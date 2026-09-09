# دليل التشغيل السريع / Quick Setup Guide

## المتطلبات / Prerequisites
- Windows 10/11
- Python 3.10+ (check: `python --version`)
- Node.js v18+ (check: `node --version`)
- npm (comes with Node.js)

## خطوات التثبيت / Installation Steps

### 1. Backend Setup
```powershell
cd medical_app1\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Frontend Setup
```powershell
cd medical_app1\frontend
npm install
```

## التشغيل / Running

### Terminal 1 - Backend
```powershell
cd medical_app1\backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 2 - Frontend
```powershell
cd medical_app1\frontend
npm run dev
```

## الوصول / Access
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

## مستخدمو العرض / Demo Users
- admin / admin123
- engineer / eng123
- technician / tech123
- doctor / doc123
- nurse / nurse123

## حل المشاكل / Troubleshooting
- PowerShell error: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process`
- Port in use: Close other apps or change port
- Module not found: Ensure venv is activated

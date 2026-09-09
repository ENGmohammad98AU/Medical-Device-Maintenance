# نظام الدعم الفني الذكي للأجهزة الطبية
# Intelligent Medical Device Fault Support System

نظام شامل لدعم القرار لمهندسي الهندسة الطبية والفنيين الطبيين. يوفر تحليلاً ذكياً للأعطال للأجهزة الطبية بما في ذلك أجهزة التنفس، أجهزة مراقبة المرضى، مضخات المحاليل، وأجهزة قياس السكر.

**هام:** هذا النظام هو أداة دعم القرار فقط. لا يحل محل مهندسي الهندسة الطبية المؤهلين ولا يوفر تعليمات إصلاح مستقلة.

A comprehensive decision-support system for biomedical engineers and medical technicians. It provides intelligent fault analysis for medical devices including ventilators, patient monitors, infusion pumps, and glucose meters.

**Important:** This system is a decision-support tool only. It does not replace qualified biomedical engineering personnel and does not provide autonomous repair instructions.

## Tech Stack

### Frontend
- React + TypeScript
- Vite
- Material UI
- Tailwind CSS
- React Router
- Zustand / TanStack Query

### Backend
- Python + FastAPI
- SQLAlchemy 2
- Pydantic
- JWT Authentication

### Database
- PostgreSQL (primary)
- SQLite (fallback for development)

### AI & Intelligence
- LangChain
- ChromaDB
- NLP Entity Extraction
- RAG (Retrieval-Augmented Generation)
- Fault Classification Service
- Safety Layer Enforcement
- Duplicate Detection
- Audit Trail System
- Evaluation & Metrics
- Configurable LLM provider (Demo mode, Ollama, OpenAI-compatible)

## Project Structure

```
medical_app1/
├── frontend/          # React frontend
│   ├── src/
│   │   ├── pages/    # Page components
│   │   ├── components/ # Reusable components
│   │   └── App.tsx   # Main app component
│   └── package.json
├── backend/           # FastAPI backend
│   └── app/
│       ├── api/       # API endpoints
│       │   ├── intelligent_support.py  # Intelligent support API
│       │   ├── devices.py
│       │   ├── fault_reports.py
│       │   └── maintenance.py
│       ├── models/    # SQLAlchemy models
│       ├── schemas/   # Pydantic schemas
│       ├── services/  # Business logic
│       │   ├── fault_classification_service.py
│       │   ├── nlp_entity_extractor.py
│       │   ├── knowledge_base_service.py
│       │   ├── safety_layer_service.py
│       │   ├── data_cleaning_service.py
│       │   ├── rag_service.py
│       │   ├── duplicate_detection_service.py
│       │   ├── audit_trail_service.py
│       │   └── evaluation_service.py
│       ├── database/  # Database configuration
│       ├── core/      # Core utilities
│       ├── security/  # Authentication & authorization
│       └── main.py    # Application entry point
├── database/          # Database files
├── knowledge_base/    # Knowledge base storage
├── manuals/           # PDF manuals
├── embeddings/        # ChromaDB embeddings
├── docs/             # Documentation
├── tests/            # Integration tests
├── .env.example      # Environment variables template
└── README.md         # This file
```

## Installation

### Prerequisites

- Windows 10/11
- Node.js v18+ (tested with v25.6.0)
- npm v9+ (tested with 11.8.0)
- Python 3.10+ (tested with 3.12.0)
- PostgreSQL 12+ (optional, SQLite fallback available)
- Git

### Windows Setup

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd medical_app1
```

#### 2. Backend Setup

```powershell
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
copy ..\.env.example .env

# Edit .env with your configuration (optional for demo mode)
notepad .env

# Initialize database (automatic on first run)
python -m app.main
```

#### 3. Frontend Setup

```powershell
cd frontend

# Install dependencies
npm install

# Run frontend
npm run dev
```

### Quick Start (Demo Mode)

The system works in demo mode without PostgreSQL or external AI services:

```powershell
# Terminal 1 - Backend
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access the application at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Environment Variables

Copy `.env.example` to `.env` and configure:

- **DATABASE_URL**: PostgreSQL connection string
- **SECRET_KEY**: JWT secret key (change in production)
- **AI_MODE**: `demo` for demo mode, `ollama` for local LLM, `openai` for OpenAI
- **OPENAI_API_KEY**: Required if using OpenAI
- **OLLAMA_BASE_URL**: Default: `http://localhost:11434`
- **FRONTEND_URL**: Frontend URL for CORS

## Demo Mode

Set `AI_MODE=demo` in `.env` to run without external AI services. Demo mode uses deterministic synthetic data and is clearly labeled as DEMO.

**Note:** Demo data is synthetic and not real clinical data.

## Starting the Application

### Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m app.main
```

Backend runs on `http://localhost:8000`

API Documentation: `http://localhost:8000/docs`

### Frontend

```powershell
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

## User Roles

- **مهندس صيانة طبية / Biomedical Engineer**: Full access to all features including intelligent support
- **فني أجهزة طبية / Medical Technician**: Limited to device management and reports
- **فني صيانة عامة / General Maintenance Technician**: Basic device access
- **فني عناية مخبري / Lab Care Technician**: Lab equipment access
- **طبيب / Doctor**: View-only access to reports and analytics
- **ممرض / Nurse**: View-only access to device status
- **مسؤول أجهزة طبية / Medical Device Officer**: Device management
- **قسم الجودة / Quality Management**: Audit and review access
- **مستخدم عادي / Non-Expert User**: Limited access with safety restrictions
- **مسؤول النظام / Administrator**: Full system administration

## Supported Devices

### أجهزة التنفس / Ventilators
- Hamilton C6
- Dräger Evita
- Maquet Servo-i

### أجهزة مراقبة المرضى / Patient Monitors
- Philips MX800
- GE Healthcare Dash
- Mindray BeneVision

### مضخات المحاليل / Infusion Pumps
- Perfusor Space
- Baxter Spectrum
- Smiths CADD

### أجهزة قياس السكر / Glucose Meters
- Accu-Chek
- OneTouch
- FreeStyle Libre

### أجهزة غازات الدم / Blood Gas Analyzers
- Radiometer ABL
- Siemens RAPIDPoint
- Abbott i-STAT

### أجهزة قياس الأكسجين / SpO2 Monitors
- Masimo Radical-7
- Nellcor OxiMax
- Philips IntelliVue

### أجهزة قياس ضغط الدم / Blood Pressure Monitors
- Omron
- Welch Allyn
- GE Dinamap

### أجهزة التخدير / Anesthesia Machines
- Dräger Perseus
- GE Aisys
- Maquet FLOW-i

### أنظمة الغازات الطبية / Medical Gas Systems
- Medical gas manifold systems
- Vacuum systems
- Medical air compressors

### أجهزة الحضانة / Incubators
- Dräger Babylog
- GE Giraffe
- Ohmeda

### أجهزة غسيل الكلى / Dialysis Machines
- Fresenius 2008K
- Baxter Dialog
- Nikkiso DBB

## Safety Limitations

### قيود السلامة / Safety Limitations

1. **أداة دعم القرار فقط / Decision Support Only**: This system assists but does not replace biomedical engineers
2. **لا إصلاح مستقل / No Autonomous Repair**: Never provides unsafe repair instructions
3. **الإنذارات الحرجة / Critical Alarms**: ICU critical alarms require escalation to qualified personnel
4. **مبني على الأدلة / Evidence-Based**: All AI responses must be supported by evidence or clearly state insufficient evidence
5. **لا تزوير / No Fabrication**: Never fabricates error codes, manual references, or technical procedures

### الاعتبارات الأخلاقية والأمنية / Ethical and Security Considerations

- **إزالة بيانات المرضى / Patient Data Removal**: Removes unnecessary patient data from reports before processing or storage
- **الخصوصية / Privacy**: No personal or clinical information sent to external services without privacy policies and anonymization
- **نطاق النظام / System Scope**: Limited to engineering and operational decision support, no diagnosis or treatment decisions
- **Human-in-the-loop**: Engineers review solutions and decide acceptance, modification, or escalation
- **سجل التدقيق / Audit Trail**: Records instructions, retrieved chunks, model results, and user decisions for audit and improvement
- **إجراءات إلزامية / Mandatory Procedures**: High-risk cases linked to mandatory procedures

## Testing

### Backend Tests

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pytest
```

### Frontend Tests

```powershell
cd frontend
npm test
```

## Project Architecture

### Intelligent Support Pipeline

```
Fault Report / بلاغ العطل
    ↓
Data Cleaning / تنظيف البيانات
    ↓
Duplicate Detection / اكتشاف التكرار
    ↓
NLP Entity Extraction / استخراج الكيانات
    ↓
Fault Classification / تصنيف العطل
    ↓
Knowledge Base Search / البحث في قاعدة المعرفة
    ↓
RAG Response Generation / توليد الإجابة
    ↓
Safety Layer Validation / التحقق من السلامة
    ↓
Escalation Decision / قرار التصعيد
    ↓
Audit Trail Logging / سجل التدقيق
    ↓
Final Report / التقرير النهائي
```

### AI Pipeline

```
Fault Report
    ↓
NLP Processing
    ↓
Entity Extraction
    ↓
Device Recognition
    ↓
Alarm Recognition
    ↓
Severity Engine
    ↓
Knowledge Search
    ↓
Similar Cases
    ↓
LLM Generation
    ↓
Safety Validation
    ↓
Final Report
```

### RAG Pipeline

```
PDF Upload
    ↓
Text Extraction
    ↓
Chunking
    ↓
Embeddings
    ↓
ChromaDB Storage
    ↓
Vector Search
    ↓
References
    ↓
AI Response
```

## Intelligent Support Features

### استخراج الكيانات / Entity Extraction
- Device type / نوع الجهاز
- Error codes / أكواد الأخطاء
- Department / القسم
- Manufacturer / الشركة المصنعة
- Model / الموديل
- Severity / درجة الخطورة

### تصنيف الأعطال / Fault Classification
- Severity level / مستوى الخطورة
- Importance level / مستوى الأهمية
- Fault level / مستوى العطل
- Emergency detection / اكتشاف الحالات الطارئة
- Specialist requirement / متطلب الأخصائي

### طبقة السلامة / Safety Layer
- Prevents unauthorized clinical advice / يمنع النصائح السريرية غير المصرح بها
- Enforces escalation for critical cases / يفرض التصعيد للحالات الحرجة
- Role-based content filtering / تصفية المحتوى حسب الدور
- Mandatory procedures for high-risk cases / إجراءات إلزامية للحالات عالية الخطورة

### اكتشاف التكرار / Duplicate Detection
- Identifies duplicate reports / يحدد البلاغات المكررة
- Pattern analysis for recurring faults / تحليل الأنماط للأعطال المتكررة
- Preventive maintenance recommendations / توصيات الصيانة الوقائية

### سجل التدقيق / Audit Trail
- Records all inputs and outputs / يسجل جميع المدخلات والمخرجات
- Tracks engineer decisions / يتتبع قرارات المهندسين
- Source attribution / إسناد المصادر
- Confidence scores / درجات الثقة

## Evaluation Metrics

### معايير التقييم / Evaluation Criteria

1. **دقة التصنيف / Classification Accuracy**
   - Accuracy, Precision, Recall, F1-score
   - Evaluated on labeled fault reports

2. **جودة الحلول والسلامة / Solution Quality & Safety**
   - Expert evaluation of solution correctness
   - Clarity and applicability scores
   - Count of unsafe recommendations
   - Out-of-scope recommendations

3. **الاعتماد على المصادر / Source Attribution**
   - Percentage of answers supported by documentation
   - Average sources per answer
   - Source quality score

4. **زمن الاستجابة / Response Time**
   - Average, median, P95, P99 response times
   - Comparison with manual manual search

5. **رضا المستخدمين / User Satisfaction**
   - Ease of use score
   - Usefulness score
   - Would recommend percentage

6. **دقة التصعيد / Escalation Accuracy**
   - Correct vs incorrect escalations
   - Missed escalations
   - False escalations

## API Documentation

Once the backend is running, visit `http://localhost:8000/docs` for interactive API documentation.

## Sending to Another Person / إرسال لشخص آخر

### What to Send / ما يجب إرساله

Send the entire `medical_app1` folder as a ZIP file containing:
- `frontend/` folder
- `backend/` folder
- `README.md` file
- `.env.example` file (if exists)

### Recipient Requirements / متطلبات المستلم

The recipient needs:
1. **Windows 10/11** operating system
2. **Python 3.10+** installed
3. **Node.js v18+** installed
4. **npm** installed

### Installation Steps for Recipient / خطوات التثبيت للمستلم

```powershell
# 1. Extract the ZIP file
# 2. Open PowerShell in the medical_app1 folder

# 3. Backend Setup
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. Frontend Setup
cd ..\frontend
npm install

# 5. Run the application
# Terminal 1 - Backend
cd ..\backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend
cd ..\frontend
npm run dev
```

### Demo Users / مستخدمو العرض

Login with these demo accounts:
- **admin** / admin123 (Administrator)
- **engineer** / eng123 (Biomedical Engineer)
- **technician** / tech123 (Medical Technician)
- **doctor** / doc123 (Doctor)
- **nurse** / nurse123 (Nurse)

## Troubleshooting

### PostgreSQL Connection Issues

If PostgreSQL is not available, the system will fall back to SQLite. Set `SQLITE_FALLBACK=true` in `.env`.

### Python Module Not Found

Ensure virtual environment is activated:

```powershell
.\venv\Scripts\Activate.ps1
```

### Frontend Build Issues

Clear node_modules and reinstall:

```powershell
rm -r node_modules
npm install
```

## Development Workflow

The project is developed in phases:

1. Phase 0: Environment inspection ✓
2. Phase 1: Project structure initialization
3. Phase 2: Backend foundation
4. Phase 3: Database
5. Phase 4: Authentication
6. Phase 5: Frontend design system
7. Phase 6: Dashboard
8. Phase 7: Medical Devices
9. Phase 8: Fault Reports
10. Phase 9: AI Demo Pipeline
11. Phase 10: RAG/Knowledge Base
12. Phase 11: Engineer Review
13. Phase 12: Maintenance/Spare Parts
14. Phase 13: Statistics
15. Phase 14: Security/Audit
16. Phase 15: Testing
16. Phase 16: Documentation

## License

This project is for academic purposes (Master's thesis).

## Contact

For questions or issues, please contact the development team.

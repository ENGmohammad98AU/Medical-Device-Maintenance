# ملخص المشروع / Project Summary
# Intelligent Medical Device Fault Support System

## 📋 ما هو هذا المشروع؟ / What is this project?

نظام ذكي لدعم القرار لمهندسي الهندسة الطبية والفنيين الطبيين. يوفر تحليلاً شاملاً للأعطال للأجهزة الطبية مع طبقة سلامة متقدمة.

An intelligent decision-support system for biomedical engineers and medical technicians. It provides comprehensive fault analysis for medical devices with advanced safety layer.

## ✨ المميزات الرئيسية / Key Features

### 1. استقبال البلاغات / Fault Report Reception
- استقبال بلاغات الأعطال من أقسام المستشفى
- Receive fault reports from hospital departments
- دعم اللغتين العربية والإنجليزية
- Bilingual support (Arabic/English)

### 2. استخراج الكيانات / Entity Extraction
- استخراج نوع الجهاز، القسم، الموديل، كود الخطأ
- Extract device type, department, model, error code
- تحديد حالة استخدام الجهاز مع المريض
- Determine patient connection status

### 3. تصنيف الأعطال / Fault Classification
- تصنيف حسب الخطورة والأهمية
- Classification by severity and importance
- اكتشاف الحالات الطارئة تلقائياً
- Automatic emergency detection
- تحديد متطلب الأخصائي
- Specialist requirement determination

### 4. قاعدة المعرفة / Knowledge Base
- كتيبات الخدمة وإجراءات الصيانة
- Service manuals and maintenance procedures
- أكواد الأخطاء ومعانيها
- Error codes and meanings
- إجراءات المعايرة
- Calibration procedures

### 5. محرك RAG / RAG Engine
- استرجاع المقاطع ذات الصلة
- Retrieve relevant chunks
- توليد إجابات موثقة بالمصادر
- Generate documented responses
- إسناد المصادر
- Source attribution

### 6. طبقة السلامة / Safety Layer
- منع النصائح السريرية غير المصرح بها
- Prevent unauthorized clinical advice
- فرض التصعيد للحالات الحرجة
- Enforce escalation for critical cases
- إجراءات إلزامية للحالات عالية الخطورة
- Mandatory procedures for high-risk cases

### 7. اكتشاف التكرار / Duplicate Detection
- تحديد البلاغات المكررة
- Identify duplicate reports
- تحليل الأنماط للأعطال المتكررة
- Pattern analysis for recurring faults
- توصيات الصيانة الوقائية
- Preventive maintenance recommendations

### 8. سجل التدقيق / Audit Trail
- تسجيل جميع المدخلات والمخرجات
- Record all inputs and outputs
- تتبع قرارات المهندسين
- Track engineer decisions
- إسناد المصادر ودرجات الثقة
- Source attribution and confidence scores

### 9. نظام التقييم / Evaluation System
- دقة التصنيف (Accuracy, Precision, Recall, F1)
- Classification accuracy
- جودة الحلول والسلامة
- Solution quality and safety
- زمن الاستجابة
- Response time
- رضا المستخدمين
- User satisfaction

## 🏥 الأجهزة المدعومة / Supported Devices

### 19 نوع من الأجهزة الطبية / 19 Medical Device Types
- أجهزة التنفس / Ventilators
- أجهزة مراقبة المرضى / Patient Monitors
- مضخات المحاليل / Infusion Pumps
- أجهزة قياس السكر / Glucose Meters
- أجهزة غازات الدم / Blood Gas Analyzers
- أجهزة قياس الأكسجين / SpO2 Monitors
- أجهزة قياس ضغط الدم / Blood Pressure Monitors
- أجهزة التخدير / Anesthesia Machines
- أنظمة الغازات الطبية / Medical Gas Systems
- أجهزة الحضانة / Incubators
- أجهزة غسيل الكلى / Dialysis Machines
- أجهزة تخطيط القلب / ECG Machines
- أجهزة الموجات فوق الصوتية / Ultrasound
- أجهزة الأشعة السينية / X-Ray Machines
- أجهزة الرنين المغناطيسي / MRI Machines
- أجهزة CT / CT Scanners
- مضخات الحقن / Syringe Pumps
- أجهزة إزالة الرجفان / Defibrillators
- معدات المختبرات / Lab Equipment

## 👥 الأدوار المدعومة / Supported Roles

### 9 أدوار مستخدمين / 9 User Roles
1. مهندس صيانة طبية / Biomedical Engineer
2. فني أجهزة طبية / Medical Technician
3. فني صيانة عامة / General Maintenance Technician
4. فني عناية مخبري / Lab Care Technician
5. طبيب / Doctor
6. ممرض / Nurse
7. مسؤول أجهزة طبية / Medical Device Officer
8. قسم الجودة / Quality Management
9. مسؤول النظام / Administrator

## 🔒 الاعتبارات الأخلاقية والأمنية / Ethical and Security Considerations

- ✅ إزالة بيانات المرضى قبل المعالجة
- ✅ Patient data removal before processing
- ✅ عدم إرسال معلومات شخصية لخدمات خارجية
- ✅ No personal info sent to external services
- ✅ حصر النظام في دعم القرار الهندسي
- ✅ System limited to engineering decision support
- ✅ Human-in-the-loop: مراجعة المهندس إلزامية
- ✅ Engineer review is mandatory
- ✅ سجل تدقيق شامل
- ✅ Comprehensive audit trail
- ✅ إجراءات إلزامية للحالات عالية الخطورة
- ✅ Mandatory procedures for high-risk cases

## 📊 معايير التقييم / Evaluation Metrics

### 6 معايير رئيسية / 6 Key Metrics
1. **دقة التصنيف / Classification Accuracy**
   - Accuracy, Precision, Recall, F1-score

2. **جودة الحلول والسلامة / Solution Quality & Safety**
   - Expert evaluation scores
   - Unsafe recommendations count

3. **الاعتماد على المصادر / Source Attribution**
   - Documented answers percentage
   - Average sources per answer

4. **زمن الاستجابة / Response Time**
   - Average, median, P95, P99 times

5. **رضا المستخدمين / User Satisfaction**
   - Ease of use and usefulness scores

6. **دقة التصعيد / Escalation Accuracy**
   - Correct vs incorrect escalations

## 🛠️ التقنيات المستخدمة / Technologies Used

### Backend / الخادم الخلفي
- Python 3.12
- FastAPI
- SQLAlchemy 2
- Pydantic
- JWT Authentication

### Frontend / الواجهة الأمامية
- React + TypeScript
- Vite
- Material UI
- Tailwind CSS

### AI & Intelligence / الذكاء الاصطناعي
- LangChain
- NLP Entity Extraction
- RAG (Retrieval-Augmented Generation)
- Fault Classification Service
- Safety Layer Enforcement
- Duplicate Detection
- Audit Trail System
- Evaluation & Metrics

### Database / قاعدة البيانات
- SQLite (default)
- PostgreSQL (optional)

## 📁 هيكل المشروع / Project Structure

```
medical_app1/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── services/    # Business logic (9 services)
│   │   ├── models/      # Database models
│   │   └── main.py      # Entry point
│   ├── start_backend.bat # Quick start script
│   └── requirements.txt  # Python dependencies
├── frontend/             # React frontend
│   ├── src/
│   │   ├── pages/       # Page components
│   │   └── App.tsx      # Main app
│   ├── start_frontend.bat # Quick start script
│   └── package.json     # Node dependencies
├── README.md            # Full documentation
├── SETUP.md             # Quick setup guide
└── SUMMARY.md           # This file
```

## 🚀 كيفية التشغيل السريع / Quick Start

### 1. Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
start_backend.bat
```

### 2. Frontend
```powershell
cd frontend
npm install
start_frontend.bat
```

### 3. Access
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 🔐 مستخدمو العرض / Demo Users

- admin / admin123
- engineer / eng123
- technician / tech123
- doctor / doc123
- nurse / nurse123

## 📖 المزيد من المعلومات / More Information

- الوثائق الكاملة / Full Documentation: `README.md`
- دليل التشغيل السريع / Quick Setup: `SETUP.md`
- وثائق API / API Documentation: http://localhost:8000/docs

## ⚠️ تنبيه هام / Important Warning

هذا النظام هو أداة دعم القرار فقط. لا يحل محل مهندسي الهندسة الطبية المؤهلين ولا يوفر تعليمات إصلاح مستقلة.

This system is a decision-support tool only. It does not replace qualified biomedical engineering personnel and does not provide autonomous repair instructions.

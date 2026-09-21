# نظام دعم فني لدعم ومعالجة طلبات العملاء معتمد على نماذج معالجة اللغة الكبيرة في عملية التصنيف والتوجيه
# Intelligent Medical Device Fault Support System
## روابط المشروع / Project Links

🌐 **الموقع المنشور / Live Website**  
[فتح الموقع](https://medical-app-frontend-8iiq.onrender.com/login)

🎥 **فيديو عرض المشروع / Project Demo**  
[مشاهدة أو تحميل فيديو المشروع](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/raw/refs/heads/main/report%20%2B%20demo/DEMO.mp4)

📄 **تقرير مشروع الماجستير / Master's Project Report**  
[تحميل تقرير المشروع](https://github.com/ENGmohammad98AU/Medical-Device-Maintenance/raw/refs/heads/main/report%20%2B%20demo/mohamad_330903_F25-Report.docx)

مشروع مقدّم لنيل درجة الماجستير في علوم الحاسوب في الجامعة الافتراضية السورية يعمل على **إدارة الأجهزة الطبية، تسجيل بلاغات الأعطال، متابعة أعمال الصيانة، واسترجاع حلول مرجعية موثقة مرتبطة بالشركة المصنّعة والموديل**.

A student project designed to support biomedical engineers and medical technicians in **medical-device management, fault reporting, maintenance tracking, and retrieval of manufacturer-referenced troubleshooting information**.

> **تنبيه / Disclaimer:** هذا النظام أداة دعم قرار هندسي وتعليمي، ولا يستبدل تعليمات الشركة المصنّعة أو إجراءات المستشفى أو حكم مهندس أجهزة طبية مؤهل. الحالات الحرجة يجب تصعيدها وفق إجراءات المنشأة.

---

## النطاق الحالي / Current Scope

قاعدة الأعطال المرجعية الحالية تغطي **3 أجهزة طبية** بإجمالي **39 قاعدة عطل مرجعية**:

| الشركة / Manufacturer | الجهاز / Device | الموديل / Model | النوع / Type | عدد القواعد / Rules |
|---|---|---|---|---:|
| Hamilton Medical | Hamilton C6 Ventilator | C6 | Ventilator | 12 |
| Philips | IntelliVue MX800 Monitor | MX800 | Patient Monitor | 12 |
| B. Braun | Perfusor Space Pump | Perfusor Space | Syringe Pump | 15 |

المصدر المرجعي الرئيسي داخل المشروع:

```text
backend/reference_data/medical_device_fault_reference.json
```

كل سجل مرجعي يتضمن مجموعة من الحقول، مثل:

- `rule_id`
- `device_name`
- `manufacturer`
- `model`
- `device_type`
- `fault_code`
- `alarm_code`
- `error_message`
- `meaning`
- `severity`
- `possible_causes`
- `immediate_safety_action`
- `troubleshooting_steps`
- `recommended_solution`
- `verification_before_return_to_service`
- `source`
- `reference_url`
- `reference_page`
- `aliases`
- `match_status`

> **ملاحظة:** `rule_id` هو معرّف داخلي للسجل المرجعي، وليس بالضرورة Error Code رسميًا ظاهرًا على شاشة الجهاز. بعض حقول `fault_code` و`alarm_code` قد تكون فارغة إذا لم يتضمن المصدر المصنّع كودًا رسميًا موثقًا.

---

## الوظائف الرئيسية / Main Features

- إدارة الأجهزة الطبية / Medical device management
- تسجيل بلاغات الأعطال / Fault report management
- تسجيل ومتابعة أعمال الصيانة / Maintenance records
- تسجيل الدخول والصلاحيات باستخدام JWT / JWT authentication and role-based access
- استخراج معلومات من وصف العطل / NLP entity extraction
- تصنيف مستوى الخطورة / Fault severity classification
- مطابقة البلاغ مع قاعدة الأعطال المرجعية / Reference fault matching
- البحث عن حلول موثقة مرتبطة بالشركة والموديل / Manufacturer-aware reference lookup
- طبقة أمان وتصعيد للحالات عالية الخطورة / Safety and escalation layer
- اكتشاف البلاغات المتكررة / Duplicate detection
- سجل تدقيق للأحداث / Audit trail
- إحصائيات وتقارير / Dashboard and statistics
- تصنيف محلي بالقواعد أو تصنيف LLM عبر Groq أو OpenAI في صفحة الصيانة، مع توجيه مقترح ومراجعة بشرية / Reference, Groq, or OpenAI LLM triage

---

## التقنيات المستخدمة / Tech Stack

### Frontend

- React 18
- TypeScript
- Vite
- Material UI
- Tailwind CSS
- React Router
- TanStack Query
- Zustand
- Recharts
- Axios

### Backend

- Python
- FastAPI
- SQLAlchemy 2
- Pydantic
- JWT Authentication
- Passlib / bcrypt

### Database

- PostgreSQL كخيار أساسي للإنتاج / Primary production option
- SQLite للتطوير المحلي / Local development fallback

### AI & Retrieval Components

- LangChain
- ChromaDB
- NLP Entity Extraction
- Fault Classification
- Reference Lookup
- RAG service components
- Safety Layer
- Duplicate Detection
- Audit Trail
- Evaluation Service

---

## بنية المشروع / Project Structure

```text
Medical-Device-Maintenance/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── DevicesPage.tsx
│   │   │   ├── FaultReportsPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── MaintenancePage.tsx
│   │   │   └── StatisticsPage.tsx
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── database/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── schemas/
│   │   ├── security/
│   │   ├── services/
│   │   └── main.py
│   ├── database/
│   │   └── medical_ai.db
│   ├── reference_data/
│   │   ├── medical_device_fault_reference.json
│   │   └── medical_device_fault_reference.example.json
│   ├── requirements.txt
│   └── start_backend.bat
│
├── .env.example
├── .gitignore
├── docker-compose.yml
├── render.yaml
├── backend-openapi.json
├── run_project.bat
├── SETUP.md
├── DEPLOYMENT.md
└── README.md
```

مجلدات بيئة التشغيل مثل `.venv/` و`node_modules/` وملفات السجلات والـembeddings غير مرفوعة إلى Git لأنها قابلة لإعادة الإنشاء أو مخصصة للتشغيل المحلي.

---

## التشغيل على Windows / Windows Setup

### 1. استنساخ المشروع / Clone

```powershell
git clone https://github.com/ENGmohammad98AU/Medical-Device-Maintenance.git
cd Medical-Device-Maintenance
```

### 2. إعداد الـBackend

```powershell
cd backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

copy ..\.env.example .env

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend:

```text
http://localhost:8000
```

Swagger / OpenAPI:

```text
http://localhost:8000/docs
```

### 3. إعداد الـFrontend

افتح Terminal جديدًا من مجلد المشروع:

```powershell
cd frontend

npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

## التشغيل السريع / Quick Start

يمكن أيضًا استخدام ملفات التشغيل الموجودة في المشروع:

```text
run_project.bat
backend/start_backend.bat
frontend/start_frontend.bat
```

قد تحتاج إلى تثبيت Python وNode.js والحزم المطلوبة قبل أول تشغيل.

---

## إعدادات البيئة / Environment Variables

انسخ:

```text
.env.example
```

إلى:

```text
.env
```

ثم عدّل القيم عند الحاجة.

أهم الإعدادات:

```text
DATABASE_URL
SQLITE_FALLBACK
SQLITE_PATH
SEED_DEMO_DATA
SECRET_KEY
AI_MODE
OPENAI_API_KEY
GROQ_API_KEY
GROQ_MODEL
OLLAMA_BASE_URL
LLM_MODEL
FRONTEND_URL
BACKEND_URL
```

ملف `.env` الحقيقي مستبعد من Git، بينما `.env.example` يحتوي قيمًا نموذجية فقط.

### التصنيف والتوجيه بنموذج لغوي كبير

تدعم صفحة الصيانة نموذج `openai/gpt-oss-20b` عبر Groq عند ضبط
`AI_MODE=groq` و`GROQ_API_KEY` على الخادم. تتوفر خطة Groq مجانية محدودة الحصة؛
يجب إبقاء الحساب على Free دون ترقيته. عند بلوغ الحد يعود التطبيق إلى القواعد،
ولا ينتقل تلقائيًا إلى مزوّد مدفوع. يدعم أيضًا OpenAI Responses API عبر
`AI_MODE=openai` و`OPENAI_API_KEY` بفوترة مستقلة. الوضع الافتراضي `reference`
يستخدم القواعد دون اتصال خارجي. يعيد النموذج تصنيف البلاغ وجهة مراجعة مقترحة،
مع التحقق من المخرجات والحفاظ على أولوية الطوارئ؛ تبقى إجراءات الصيانة من المراجع.
توضح الواجهة والسجل مصدر القرار وحالات الرجوع إلى القواعد.
راجع [دليل التفعيل والاختبار والتوثيق البحثي](docs/LLM_INTEGRATION_AR.md).

---

## حسابات العرض / Demo Accounts

عند تفعيل:

```text
SEED_DEMO_DATA=true
```

يمكن للنظام إنشاء حسابات تجريبية محلية للاختبار:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |
| `engineer` | `engineer123` | Biomedical Engineer |
| `technician` | `technician123` | Medical Technician |
| `doctor` | `doctor123` | Doctor |
| `nurse` | `nurse123` | Nurse |

هذه الحسابات **تجريبية فقط** وليست مخصصة للاستخدام الإنتاجي.

---

## قاعدة البيانات المرجعية / Reference Database

يحتوي المستودع على قاعدة SQLite:

```text
backend/database/medical_ai.db
```

كما يحتوي على ملف المصدر المرجعي القابل للمراجعة والتحكم بالإصدارات:

```text
backend/reference_data/medical_device_fault_reference.json
```

عند بدء الـBackend، يقوم التطبيق بمزامنة قواعد الأعطال المرجعية من ملف JSON إلى قاعدة البيانات.

بهذا يكون ملف JSON هو المصدر المرجعي الواضح القابل للمراجعة، بينما تستخدم قاعدة البيانات للتشغيل والاستعلام.

---

## منطق الدعم الفني / Intelligent Support Flow

```text
بلاغ العطل / Fault Report
        ↓
تنظيف النص / Data Cleaning
        ↓
اكتشاف التكرار / Duplicate Detection
        ↓
استخراج الكيانات / NLP Entity Extraction
        ↓
تحديد الجهاز والموديل / Device & Model Validation
        ↓
مطابقة قاعدة الأعطال / Reference Fault Matching
        ↓
تحديد الخطورة / Severity Assessment
        ↓
إجراءات السلامة / Safety Validation
        ↓
الحل المرجعي / Recommended Reference Solution
        ↓
سجل التدقيق / Audit Trail
```

إذا لم توجد مطابقة مرجعية كافية، يجب أن يوضح النظام أن المرجع غير متوفر بدل اختلاق كود أو تشخيص غير موثق.

---

## الاختبارات / Testing

### Backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

توجد أيضًا ملفات اختبار وفحص مخصصة داخل `backend/` لاختبار قاعدة الأعطال والمصادقة والمطابقة المرجعية.

### Frontend

```powershell
cd frontend
npm test
```

لبناء نسخة الإنتاج:

```powershell
npm run build
```

---

## النشر / Deployment

يتضمن المشروع:

```text
render.yaml
```

وهو يعرّف خدمة Backend وقاعدة PostgreSQL وخدمة Frontend ثابتة على Render.

في إعداد الإنتاج المقترح:

- `DEBUG=false`
- `SQLITE_FALLBACK=false`
- `SEED_DEMO_DATA=false`
- يتم توليد `SECRET_KEY` بواسطة بيئة النشر

---

## قيود السلامة / Safety Limitations

1. النظام أداة دعم قرار فقط ولا يستبدل مهندس الأجهزة الطبية المؤهل.
2. يجب التعامل مع تعليمات الشركة المصنّعة بوصفها المرجع النهائي للأجهزة.
3. الحالات الحرجة تتطلب التصعيد إلى المختصين وفق إجراءات المنشأة.
4. لا ينبغي توليد أكواد أعطال أو إجراءات غير موثقة عند غياب المرجع.
5. لا يجوز استخدام المشروع لاتخاذ قرارات تشخيصية أو علاجية للمرضى.
6. البيانات المستخدمة في العرض والاختبار يجب ألا تتضمن بيانات مرضى حقيقية.

---

## ملاحظات أكاديمية / Academic Notes

- المشروع **نموذج طلابي / Student Prototype** وليس نظامًا طبيًا معتمدًا للاستخدام السريري.
- قواعد الأعطال الحالية مقتصرة على الأجهزة الثلاثة المذكورة في قسم **Current Scope**.
- المراجع الفنية لكل قاعدة عطل محفوظة داخل ملف JSON من خلال بيانات المصدر والرابط والصفحة المرجعية.
- لا ينبغي اعتبار `rule_id` كود خطأ رسميًا إلا إذا نص المصدر المصنّع على ذلك صراحة.
- توسيع المشروع لأجهزة إضافية يتطلب إضافة مراجع موثقة واختبار المطابقة والسلامة قبل اعتمادها داخل قاعدة المعرفة.

---

## الهدف الأكاديمي / Academic Objective

يهدف المشروع إلى توضيح كيفية دمج:

**إدارة الصيانة + قاعدة أعطال مرجعية + معالجة لغة طبيعية + مطابقة ذكية + طبقة سلامة + سجل تدقيق**

في منصة واحدة تساعد مهندس الأجهزة الطبية على الوصول إلى معلومات الصيانة بطريقة أسرع وأكثر تنظيمًا وقابلية للتتبع.

---

## الترخيص / License

لم يتم اختيار ترخيص مفتوح المصدر للمستودع حاليًا. المشروع مخصص للأغراض الأكاديمية والعرض الطلابي.

---

## Repository

```text
https://github.com/ENGmohammad98AU/Medical-Device-Maintenance
```

# Code / Chapter Alignment Notes

## Fixed in this build

- User-role comparisons are consistent with the lowercase `UserRole` enum values.
- Biomedical engineer / administrator decisions can be stored correctly.
- Audit logs, engineer decisions, duplicate-detection records, and evaluation events persist in SQLAlchemy/PostgreSQL/SQLite.
- Backend RBAC now protects device, maintenance, fault-report, audit, evaluation, and safety-sensitive mutations.
- The safety-check endpoint uses the authenticated user's role and does not trust a caller-supplied role.
- Public registration cannot create a privileged account by submitting a forged `role` field.
- Password-bearing login payloads are not logged in the browser console.
- Demo credentials are not shown in the frontend.
- Customer expertise values are consistent (`NOVICE`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`); legacy `BASIC` is normalized to `NOVICE` by the API.
- Arabic is the default language and RTL direction is enabled.
- Text cleaning preserves device/model/error-code case rather than lowercasing the entire report.
- NLP patterns recognize Hamilton Medical, B. Braun, C6, MX800, and Perfusor Space more reliably.
- PostgreSQL deployment no longer depends on SQLite-only `julianday()`.
- The three supported reference devices are inserted automatically in a new production database without enabling demo users.
- An optional first administrator can be created from production environment variables.
- The legacy fault-analysis endpoint now uses the verified 39-rule reference database instead of returning a fixed failure message.
- Dockerfiles and `docker-compose.yml` were added.
- DOCX is included in the configured allowed document extensions.

## Still a chapter/content decision, not a code bug

The verified fault-reference database currently supports these three device families:

1. Hamilton Medical C6 ventilator — 12 rules
2. Philips IntelliVue MX800 patient monitor — 12 rules
3. B. Braun Perfusor Space syringe pump — 15 rules

The chapter text currently names an anesthesia machine instead of the syringe pump. The code was **not** changed to invent an anesthesia-device database because no verified anesthesia-machine reference set was supplied. For an academically accurate report, either:

- change the chapter scope to **ventilator + patient monitor + syringe pump**, or
- provide/approve a specific anesthesia-machine manufacturer/model and verified manuals, then replace/add the device and its reference rules.

## RAG / LLM implementation status

The production diagnostic path is currently **reference-database-first**. The project contains RAG/LLM scaffolding and dependencies, but the verified 39-rule relational database is the authoritative source used for actual diagnosis. ChromaDB/LangChain/Transformers should therefore be described as proposed/optional unless a document-ingestion/vector-index pipeline is enabled and tested before submission.

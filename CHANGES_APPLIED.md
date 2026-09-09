# Changes applied

## Medical-device reference database
- Built a 39-rule manufacturer-reference starter database.
- Hamilton Medical C6: 12 rules.
- Philips IntelliVue MX800: 12 rules.
- B. Braun Perfusor Space: 15 rules.
- Every rule includes the source URL and reference page.
- Added Arabic/English aliases for conservative fault matching.

## Diagnostic path
- Manufacturer/model are hard guards to prevent cross-device matches.
- Low-confidence matches are rejected instead of guessed.
- Verified database matches now take precedence over RAG output.
- API now returns meaning, possible causes, immediate safety action, troubleshooting steps, recommended solution, return-to-service verification, source URL and page.
- The UI displays these fields and provides a direct link to the manufacturer reference.

## Database initialization
- Reference JSON is automatically synchronized into the relational database at backend startup.
- The manual import endpoint is administrator-only and can only load the bundled reference file.

## Hosting and security
- Added PostgreSQL psycopg 3 support and SQLAlchemy 2-compatible health query.
- Removed credential/parameter logging from the login request.
- Frontend API URL is configurable through `VITE_API_BASE_URL`.
- Production frontend origin is included in CORS configuration.
- Demo account seeding is configurable and intended to be disabled in production.
- Added `render.yaml`, `DEPLOYMENT.md`, and frontend environment example.

## Validation performed
- Python source compilation: passed.
- Reference JSON validation: passed.
- Reference database rules: 39 unique IDs, all with source URLs and pages.
- Automated lookup tests: 6 passed (import count, Hamilton Arabic alias, Philips Arabic alias, B. Braun alias, cross-model guard).

## Environment limitation during validation
A full FastAPI startup smoke test was not executed in the analysis container because the container does not have every project dependency installed (for example `passlib`). The missing dependency is already declared in `backend/requirements.txt` and will be installed by the deployment build command.


## 2026-09-09 code/text alignment hardening

- Fixed lowercase/uppercase `UserRole` mismatches across intelligent-support and safety checks.
- Added backend role enforcement for device, maintenance, and fault-report mutations.
- Persisted audit logs, engineer decisions, duplicate-detection records, and evaluation events in SQLAlchemy tables.
- Added validation for engineer decision values and customer expertise values.
- Prevented safety-check role spoofing.
- Removed password-bearing login debug logs and production-visible demo credentials.
- Forced public registration to the medical-technician role to prevent privilege escalation through a crafted request.
- Made dashboard response-time calculation portable across PostgreSQL and SQLite.
- Added automatic creation of the three supported reference device catalog entries in new databases.
- Added optional environment-driven bootstrap administrator creation for production.
- Added DOCX to allowed document extensions.
- Preserved model/error-code casing during text cleaning.
- Expanded NLP recognition for Hamilton Medical, B. Braun, C6, and Perfusor Space.
- Changed the legacy fault-analysis endpoint from fixed failure output to verified reference-database lookup.
- Set the Arabic interface to RTL by default.

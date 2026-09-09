# Deployment guide — Medical Device Maintenance App

## Recommended architecture

Use three production resources:

1. **Frontend:** Vite/React static site (`frontend/`).
2. **Backend:** FastAPI web service (`backend/`).
3. **Database:** managed PostgreSQL.

The included `render.yaml` is a deployment starter for Render. It deliberately leaves `FRONTEND_URL` and `VITE_API_BASE_URL` as values to set after the public service URLs are known.

## Render deployment

### 1. Push the clean project to GitHub
Do not commit a real `.env`, database files, logs, API keys, JWT secrets, or `node_modules`.

### 2. Create a Render Blueprint from `render.yaml`
The Blueprint creates:
- `medical-app-api`
- `medical-app-frontend`
- `medical-app-db`

### 3. Set cross-service URLs
After Render assigns public URLs:

Backend environment variable:
```text
FRONTEND_URL=https://<frontend-host>.onrender.com
```

Frontend build-time environment variable:
```text
VITE_API_BASE_URL=https://<backend-host>.onrender.com
```

Redeploy the frontend after changing `VITE_API_BASE_URL`, because Vite injects `VITE_*` variables at build time.

### 4. Production security settings
Keep these values in production:

```text
DEBUG=false
ENVIRONMENT=production
SQLITE_FALLBACK=false
SEED_DEMO_DATA=false
```

`SECRET_KEY` must be a strong secret. The supplied Blueprint asks Render to generate it automatically.

### 5. Database behavior
The backend now synchronizes the bundled manufacturer reference JSON into PostgreSQL at application startup. The import is an upsert by `rule_id`, so re-deploying does not duplicate records.

### 6. Health check
Use:
```text
GET /health
```

A successful response confirms that the FastAPI process is running. Verify separately that the PostgreSQL connection is successful in the backend logs and that 39 reference rules were synchronized.

## Local development

Backend:
```bash
cd backend
python -m venv .venv
# activate the environment
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

## Important production note

The `free` database plan in `render.yaml` is intended only as a starter/demo configuration. For a real maintenance system, choose an always-available paid web-service/database plan with backups and monitoring appropriate to your operational requirements.

## Official deployment references

- Render FastAPI: https://render.com/docs/deploy-fastapi
- Render Static Sites: https://render.com/docs/static-sites
- Render Blueprints: https://render.com/docs/infrastructure-as-code
- Render Postgres: https://render.com/docs/postgresql


## First production administrator

For a new PostgreSQL database with `SEED_DEMO_DATA=false`, set these backend environment variables before the first start:

- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_EMAIL`

The account is created only if no administrator exists. Demo credentials are never required in production. The three supported reference device catalog entries are created automatically.

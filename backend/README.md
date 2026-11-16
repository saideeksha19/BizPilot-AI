# BizPilot AI — Backend API & Financial Intelligence Engine

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL (`psycopg` v3) + Google Gemini AI backend for **BizPilot AI**.

## Local Setup

1. Create and activate a Python 3.10+ virtual environment inside `backend/`:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Key variables:
   - `DATABASE_URL`: PostgreSQL (`postgresql+psycopg://...`, or Render-provided `postgres://...` / `postgresql://...` which is normalized automatically) or SQLite fallback (`sqlite:///./bizpilot_dev.db`).
   - `JWT_SECRET_KEY`: 32+ random characters in staging/production (`APP_ENV=production` rejects weak defaults).
   - `CORS_ORIGINS`: Comma-separated allowed frontend origins (no `*` in production).
   - `TRUSTED_HOSTS`: Comma-separated allowed HTTP `Host` headers in production.
   - `GEMINI_API_KEY`: Backend-only Google Gemini API key (**never** expose via frontend `VITE_*` variables).
   - `GEMINI_MODEL`: Defaults to `gemini-4-hydrogen`.
   - `REDIS_URL` (optional): Enables Redis sorted-set Copilot rate limiting across multiple instances; otherwise uses the PostgreSQL `copilot_rate_limit_events` table.

3. Apply Alembic migrations (`0001` through `0006`):
   ```bash
   alembic upgrade head
   ```

4. Optional: Seed an isolated synthetic demo dataset (`is_demo_data=True`):
   ```bash
   python -m app.scripts.seed_demo
   # Safe demo reset (touches is_demo_data=True only):
   python -m app.scripts.seed_demo --reset
   ```

5. Run the API server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Health & Readiness Probes

- `GET /api/health` and `GET /api/v1/health`: Lightweight liveness check + DB connectivity verification.
- `GET /api/v1/ready`: Readiness probe reporting database status, runtime security config status, Gemini key presence boolean (`gemini_configured`), and rate-limiter backend (`redis` or `database`).

## API Module Surface (`/api/v1`)

- **Auth (`/auth`)**: Registration, login, JWT verification, server-side revocation (`/logout`, `/logout-all`).
- **Businesses & RBAC (`/businesses`)**: Multi-tenant business creation/switching, membership roles (`owner`, `admin`, `manager`, `viewer`), and audit logs.
- **Ledger & Operations (`/businesses/{business_id}/...`)**: Categories, transactions (including reversal and CSV import/export), customers, suppliers, invoices (with line items), idempotent payments (`Idempotency-Key`), and inventory products/restock (`Idempotency-Key`).
- **Financial Intelligence (`/businesses/{business_id}/...`)**: Summary KPIs, Financial Digital Twin, 7/30/90-day Cash Flow Forecast, Financial Health Score, Risk Radar alerts, What-If Simulator (`HYPOTHETICAL`), and scenario comparison.
- **Explainable Decision Copilot (`/businesses/{business_id}/copilot/...`)**: Multi-turn persisted conversations grounded in live Decimal facts from Checkpoint F, prompt-injection sanitization, PII redaction, and Pydantic schema validation.

## Running Backend Tests

```bash
cd backend
pytest -v
```

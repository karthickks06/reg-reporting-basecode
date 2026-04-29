# Local Setup Runbook

## Purpose
Run the local stack for development and testing: frontend, backend API, worker, and persistence.

## Runtime Assumptions
- Python 3.11+ and Node.js/npm on PATH
- Node.js 18+ and npm 9+
- Free ports for frontend (`3000`) and API (`8000`)

## Install Dependencies
```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt
cd frontend && npm install
```

Copy `backend/.env.native.example` to `backend/.env` and update LLM credentials when needed.

## Start Services
Run each process in a separate terminal:

```sh
cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```sh
cd backend && ../.venv/Scripts/python start_worker.py
```

```sh
cd frontend && npm run dev
```

Local runtime data is stored under `data/`.

Verify readiness:
```sh
curl http://localhost:8000/ready
```

Open:
- Frontend: `http://localhost:3000`
- API readiness: `http://localhost:8000/ready`

## Required Environment Values
- `DATABASE_URL` for backend persistence. Local mode defaults to `sqlite:///../data/reg_reporting_local.db`.
- `AXET_LLM_URL` for the LLM gateway
- `AXET_LLM_MODEL` for default model routing
- `VITE_API_URL` in `frontend/.env.local` pointing to `http://localhost:8000/api`

## Operational Commands
- API: `cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- Worker: `cd backend && ../.venv/Scripts/python start_worker.py`
- Frontend: `cd frontend && npm run dev`

## Notes for Daily Development
- Frontend runs with hot reload through `npm run dev`.
- Keep `API_PORT` and `VITE_API_URL` aligned.

## Typical Failure Points
- Port collisions: change `.env` values and restart the affected local process.
- LLM connectivity failures: verify `AXET_LLM_URL`, network access, and SSL settings.
- Missing data in workflow steps: confirm the required artifact types were uploaded to the same `project_id`.
- For step-by-step recovery, use [19 Startup Troubleshooting](./19_STARTUP_TROUBLESHOOTING.md).

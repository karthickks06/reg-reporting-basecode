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
Run the backend and frontend in separate terminals:

```sh
cd backend && ../.venv/Scripts/python app.py
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
- `AZURE_OPENAI_ENDPOINT` for the Azure OpenAI resource
- `AZURE_OPENAI_API_KEY` for the Azure OpenAI key
- `AZURE_OPENAI_DEPLOYMENT` for default model routing
- `VITE_API_URL` in `frontend/.env.local` pointing to `http://localhost:8000/api`

## Operational Commands
- Backend API + worker: `cd backend && ../.venv/Scripts/python app.py`
- Frontend: `cd frontend && npm run dev`

## Notes for Daily Development
- Frontend runs with hot reload through `npm run dev`.
- `backend/app.py` starts the API and queue worker together.
- Keep `API_PORT` and `VITE_API_URL` aligned.

## Typical Failure Points
- Port collisions: change `.env` values and restart the affected local process.
- LLM connectivity failures: verify `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, deployment name, and network access.
- Missing data in workflow steps: confirm the required artifact types were uploaded to the same `project_id`.
- For step-by-step recovery, use [19 Startup Troubleshooting](./19_STARTUP_TROUBLESHOOTING.md).

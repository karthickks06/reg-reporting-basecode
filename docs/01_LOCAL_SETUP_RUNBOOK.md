# Local Setup Runbook

## Purpose
Run the local stack for development and testing: frontend, backend API, worker, and persistence.

## Runtime Assumptions
- Native mode: Python 3.11+ and Node.js/npm on PATH
- Container mode: Podman or Docker with compose support (and daemon/machine running)
- Node.js 18+ and npm 9+
- Free ports for frontend (`3000`) and API (`8000`)

## Standard Local Boot Without Containers
```powershell
.\start-native.ps1 -Install
```

After dependencies are installed:
```powershell
.\start-native.ps1
```

What the script does:
- creates `.venv` using your local Python
- installs backend dependencies when needed
- installs frontend dependencies when needed
- creates `backend/.env` from `backend/.env.native.example`
- starts API, worker, and Vite frontend as local processes
- stores local SQLite and Chroma data under `data/`
- writes process IDs under `.local-pids/` and logs under `.local-logs/`

Stop native processes:
```powershell
.\stop-native.ps1
```

## Container Boot
```powershell
Copy-Item .env.example .env
.\start-local.ps1
```

What the script does:
- starts `postgres`
- creates the target local database if it is missing in the compose Postgres container
- starts `api`, `worker`, and `frontend`
- waits for API and frontend readiness before reporting success

Verify readiness:
```powershell
curl.exe -sS http://localhost:<API_PORT>/ready
```

## Developer Split Mode With Containers
Use this when you want frontend hot reload instead of the containerized frontend:
```powershell
Copy-Item .env.example .env
docker compose -f compose.yaml up -d postgres api worker
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open:
- Frontend: `http://localhost:3000`
- API readiness: `http://localhost:<API_PORT>/ready`

## Required Environment Values
- `DATABASE_URL` for backend persistence. Native mode defaults to `sqlite:///../data/reg_reporting_local.db`.
- `AXET_LLM_URL` for the LLM gateway
- `AXET_LLM_MODEL` for default model routing
- `VITE_API_URL` in `frontend/.env.local` pointing to `http://localhost:<API_PORT>/api`

## Operational Commands
```powershell
.\start-local.ps1
.\stop-local.ps1
.\start-native.ps1
.\stop-native.ps1
docker compose -f compose.yaml down
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs --tail=200
docker compose -f compose.yaml logs api --tail=200
docker compose -f compose.yaml logs frontend --tail=200
```

## Notes for Daily Development
- `start-native.ps1` is the shared one-command path when you do not want Docker or Podman.
- `start-local.ps1` remains available for the Compose stack.
- Frontend can still run separately with `npm run dev` when you want hot reload during development.
- Keep `API_PORT` and `VITE_API_URL` aligned if you use split mode.

## Typical Failure Points
- Port collisions: change `.env` values and restart compose.
- LLM connectivity failures: verify `AXET_LLM_URL`, network access, and SSL settings.
- Missing data in workflow steps: confirm the required artifact types were uploaded to the same `project_id`.
- For step-by-step recovery, use [19 Startup Troubleshooting](./19_STARTUP_TROUBLESHOOTING.md).

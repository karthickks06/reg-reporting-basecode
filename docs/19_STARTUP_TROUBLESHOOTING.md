# Startup Troubleshooting

## Recommended Entry Points
- Start the backend with `backend/app.py`; it launches the API and worker together.
- Start the frontend with `npm run dev`.
- Stop the local stack by stopping those terminal sessions.
- Check API readiness with `http://localhost:8000/ready`

## If Startup Stops Early
1. Confirm the backend and frontend terminals are still running.
2. Open `http://localhost:8000/ready` and inspect the dependency payload.
3. Review the terminal output for the first failing process.

## Common Failure Cases

### Database Connection Failed
Symptoms:
- API does not become ready
- `/ready` reports database failure

Actions:
1. Verify `DATABASE_URL` in `backend/.env`
2. Confirm the configured database is reachable
3. If using AWS, verify the RDS endpoint, security group, and target database name

### pgvector Is Missing
Symptoms:
- `/ready` reports degraded mode
- startup logs show `pgvector` warning details

Actions:
1. Confirm the database allows `CREATE EXTENSION vector`
2. If using RDS, enable pgvector on the target instance
3. Re-check `/ready` after extension setup

### LLM Endpoint Failed
Symptoms:
- UI shows degraded backend status
- `/ready` reports `llm.ok=false`

Actions:
1. Verify `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY`
2. Confirm network access from the host
3. Confirm the deployment name in `AZURE_OPENAI_DEPLOYMENT`

### Frontend Did Not Start
Symptoms:
- `http://localhost:3000` does not load
- the frontend dev server exits or fails to compile

Actions:
1. Review the `npm run dev` terminal output
2. Confirm the API is healthy first
3. Reinstall frontend dependencies with `npm install` if dependency resolution changed

## Useful Commands
```sh
cd backend && ../.venv/Scripts/python app.py
cd frontend && npm run dev
curl http://localhost:8000/ready
```

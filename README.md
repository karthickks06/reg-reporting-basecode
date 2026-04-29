# Reg Reporting AI Platform

Reg Reporting AI Platform is a local-first regulatory reporting workbench that augments three personas with AI agents:
- Regulatory Business Analyst (BA)
- Data Engineer / Developer
- Regulatory QA Reviewer

The platform supports artifact ingestion, gap analysis, SQL generation, XML generation, XSD validation, PSD version comparison, and context-aware assistant chat.

## Quick Links
- [Documentation Hub](./docs/README.md)
- [Local Setup Runbook](./docs/01_LOCAL_SETUP_RUNBOOK.md)
- [End-to-End Demo Runbook](./docs/22_END_TO_END_DEMO_RUNBOOK.md)
- [System Requirements](./docs/12_SYSTEM_REQUIREMENTS.md)
- [Tech Stack](./docs/13_TECH_STACK.md)
- [Architecture](./docs/02_ARCHITECTURE.md)
- [Developer Flow Reference](./docs/21_DEVELOPER_FLOW_REFERENCE.md)
- [Use Cases](./docs/14_USE_CASES.md)
- [User Guide](./docs/15_USER_GUIDE.md)
- [API Workflows](./docs/08_LOCAL_API_WORKFLOWS.md)

## Repository Structure
- `backend/`: FastAPI application, workflow orchestration, schema/data processing
- `frontend/`: Next.js UI (agent workbench + admin)
- `infra/`: Database init and infra helpers
- `data/`: Local artifacts, generated files, synthetic input data
- `docs/`: Project documentation

## Local Startup
Run locally with Python and Node.js:
```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt
cd frontend && npm install
```

Copy `backend/.env.native.example` to `backend/.env`, then start the services in separate terminals:
```sh
cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
cd backend && ../.venv/Scripts/python start_worker.py
cd frontend && npm run dev
```

This starts the FastAPI backend, background worker, and Vite frontend. It uses SQLite at `data/reg_reporting_local.db` and embedded Chroma data under `data/chroma`.

Open:
- UI: `http://localhost:3000`
- API readiness: `http://localhost:8000/ready`

For developer split mode and troubleshooting, use [01 Local Setup Runbook](./docs/01_LOCAL_SETUP_RUNBOOK.md).

## Key Capabilities
- BA agent: PSD-to-model mapping and gap analysis
- Developer agent: schema-aware SQL generation with validation
- Reviewer agent: PSD008 XML generation with XSD validation
- Admin console: artifact management and instruction tuning
- Assistant chat: contextual Q&A over uploaded artifacts

## Documentation Navigation
Start at [docs/README.md](./docs/README.md) for complete setup, architecture, operations, and user workflows.

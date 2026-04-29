# Developer Guide

## Purpose
Use this guide to find the right module quickly. For detailed use-case flow diagrams and function-call traces, read [21 Developer Flow Reference](./21_DEVELOPER_FLOW_REFERENCE.md).

## Repository Layout
- `backend/`: FastAPI routes, services, ORM models, workflow orchestration
- `frontend/`: Next.js workbench UI, admin, analytics
- `data/`: uploaded and generated runtime artifacts
- `docs/`: setup, architecture, API, and developer reference material

## Backend Ownership
- `backend/app/main.py`: app wiring and router registration
- `backend/app/routes/`: HTTP transport layer only
- `backend/app/services/`: business logic, parsing, LLM orchestration, workflow rules
- `backend/app/services/runtime/`: startup probes and readiness payloads
- `backend/app/db.py`: engine and session wiring
- `backend/app/models*.py`: persistence contracts

## Frontend Ownership
- `frontend/components/workbench.tsx`: top-level workbench orchestration
- `frontend/components/workbench/actions/`: API-calling action modules
- `frontend/components/workbench/`: persona views, workflow home, dashboard panels
- `frontend/app/admin/`: admin route state and API helpers
- `frontend/app/analytics/`: analytics route and API helper
- `frontend/app/styles/`: shared CSS layers

## Current Runtime Rules
- Workflow stages remain `BA -> DEV -> REVIEWER -> COMPLETED`.
- Background jobs are database-backed through `job_queue`; Redis is not part of the active runtime.
- Files are stored under `data/artifacts`, while metadata and run state stay in the configured database.
- LLM calls must remain wrapped in deterministic validation before stage output is accepted.

# Frontend Notes

## Purpose
This document describes the active frontend structure and runtime expectations. Detailed startup steps live in the local runbook.

## Runtime Modes
- Local frontend mode: run `npm run dev` from `frontend/`.

## Integration Contract
- `NEXT_PUBLIC_API_BASE` must point to the backend host URL.
- The UI is currently no-auth and depends on backend workflow, artifact, admin, and health APIs.
- Backend degradation is surfaced in the workbench through health polling and status messaging.

## Active Structure
- `frontend/app/`: Next.js routes and top-level app shell
- `frontend/components/workbench/`: workbench screens and persona-specific panels
- `frontend/components/workbench/actions/`: action orchestration split by domain
- `frontend/components/workbench/health/`: backend health polling and status text
- `frontend/app/styles/`: global CSS layers for theme, layout, and components

## Key UI Surfaces
- Persona login
- Workflow Home (queue, filters, create/version workflows)
- Workbench Dashboard (BA/DEV/REVIEWER tabs)
- Workflow Action Panel (save spec, submit, send-back, download links)
- Insights/output panel (compare, SQL/XML, validation, context chat)

## Cleanup Rules
- Keep orchestration hooks separate from presentational components.
- Avoid parallel UI variants when one component is the active implementation.
- Prefer extending the existing CSS layers over adding duplicate style files for the same concern.

# AGENTS.md

## Purpose
This document defines coding standards for agents and developers working in this repository.
The primary goal is modular, maintainable, and readable code aligned with the current tech stack.

## Core Principles
- Separation of concerns: each module handles one self-contained responsibility.
- Keep files small and focused; avoid large, mixed-responsibility files.
- Prefer clear, explicit code over clever shortcuts.
- Optimize for maintainability, testability, and team collaboration.

## File and Module Size
- Do not create or keep files near 1000-2000 lines.
- Soft limit: 300 lines per file.
- Hard limit: 500 lines per file.
- If a file grows beyond soft limit, split by feature/domain immediately.

## Project Stack Conventions

### Backend (FastAPI + SQLAlchemy)
- Keep API routers thin: request validation, orchestration, response mapping only.
- Move business logic into service modules (`services/*` style).
- Keep DB access in repository/data-access modules; do not scatter raw queries in route handlers.
- Keep schema models (`pydantic`) separate from ORM models (`sqlalchemy`).
- Use explicit typing in function signatures and return types.
- Raise precise `HTTPException` messages with stable error codes/details.

### Frontend (Next.js + React + TypeScript)
- Split UI into small components with single purpose.
- Keep container/state orchestration separate from presentational components.
- Avoid monolithic page components; extract hooks/helpers when logic grows.
- Keep props typed and minimal; do not pass unrelated state.
- Co-locate component-specific helpers near component unless shared.

## Naming and Structure
- Use domain-based folders and module names.
- Use descriptive names (`workflow_service.ts`, `artifact_repository.py`) instead of generic (`utils2`, `helper_new`).
- Avoid god-modules like huge `utils` or `main` files with mixed concerns.

## Comments and Documentation
- Add comments only where intent is not obvious from code.
- Explain "why", not "what".
- Keep comments concise and current; remove stale comments during edits.
- Public functions/modules should include short docstrings describing purpose and constraints.

## Testing and Change Safety
- New modules should be testable in isolation.
- Prefer small units with deterministic inputs/outputs.
- Add or update tests for behavioral changes when test harness exists.
- Avoid broad refactors mixed with feature changes in one commit.

## Refactoring Rules
- When touching a large file, improve structure incrementally:
  1. Extract cohesive functions.
  2. Group by responsibility.
  3. Move reusable logic into dedicated modules.
- Do not duplicate logic; centralize shared behavior in one module.

## Code Review Checklist
- Is responsibility of this module single and clear?
- Is file size within limits?
- Are names domain-meaningful?
- Is business logic separated from transport/UI layers?
- Are errors explicit and actionable?
- Are comments necessary, minimal, and correct?

## Definition of Done for New Code
- Modular design with clear boundaries.
- Readable for another developer without deep context.
- No oversized files.
- Stack-aligned patterns followed.
- Basic validation/build checks pass locally.

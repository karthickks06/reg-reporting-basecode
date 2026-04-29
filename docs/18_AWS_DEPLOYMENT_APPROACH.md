# AWS Deployment Approach

## Scope
This deployment target is for an internal feedback environment:
- developers continue to build and test locally
- internal users access a shared AWS-hosted instance
- the goal is reliability and low operational friction, not horizontal scale

## Recommended Target Architecture
Use a small Linux-based AWS footprint for the shared environment:
- `1 x Linux EC2` host for the FastAPI API process and Next.js frontend process
- `Amazon RDS for PostgreSQL` with `pgvector` enabled
- `EBS` attached to the EC2 host for `data/artifacts` during the internal feedback phase
- reverse proxy on the EC2 host for HTTPS and process routing

This project should not be exposed publicly in its current shape because the UI is still local-style and no-auth.

## Why This Is The Best Fit For This Repo
- The local runtime is already centered around PostgreSQL with `pgvector`, FastAPI, and a file-backed artifact store.
- The current runtime does not depend on Redis, so the internal feedback environment does not need to carry an extra cache or queue service.
- The current async job flow runs in-process through FastAPI background tasks, so the first production-like environment does not need a separate queue platform.

## Why Not Windows EC2 As The Primary Plan
Windows EC2 is the wrong default for this repository:
- operating the backend and frontend as native Windows services is possible, but it adds friction without giving this project any clear benefit
- if a Windows host is mandated by platform policy, use it only as a fallback option and keep PostgreSQL on RDS

## Shared Internal AWS Environment
- run the frontend with `next build` and `next start`
- run the backend with Uvicorn behind a reverse proxy
- set `AUTO_CREATE_SCHEMA=false` if schema is provisioned separately, or `true` for first-time internal bootstrap
- set `AUTO_APPLY_SCHEMA_PATCHES=true` so tracked idempotent schema patches run during startup
- store secrets outside the repo and inject them at deploy time
- restrict network access to corporate CIDR ranges, VPN, or internal load balancer paths
- provision the target database through AWS infrastructure, not through application startup

## Dependency Guidance

### PostgreSQL / pgvector
Move PostgreSQL to RDS for the shared environment:
- it removes database operations from the app host
- it is a better fit for backup and restore
- the backend now reports schema and `pgvector` status through `/health`

### Files And Artifacts
The application currently stores uploaded and generated artifacts under `data/artifacts`.
- for the internal feedback phase, EBS-backed local storage is acceptable
- for multi-instance or more durable environments, move artifacts to S3 and keep metadata in PostgreSQL

## Deployment Steps
1. Provision RDS PostgreSQL with `pgvector` available.
2. Provision one Linux EC2 instance in a restricted subnet or with restricted inbound rules.
3. Install runtime dependencies for Python 3.11 and Node 18+.
4. Place backend and frontend environment variables outside source control.
5. Start the backend once in a controlled deploy window and confirm `app_schema_patches` records all schema patches.
6. Start backend and frontend processes under a service manager.
7. Validate `/health` and `/ready` before sharing the URL.

## Required Settings For The Shared Environment
- `ENVIRONMENT=aws-internal`
- `DATABASE_URL=<rds-connection-string>`
- `AXET_LLM_URL=<approved-llm-endpoint>`
- `AXET_LLM_MODEL=<approved-model>`
- `AUTO_CREATE_SCHEMA=false`
- `AUTO_APPLY_SCHEMA_PATCHES=true`

## Operational Notes
- `/health` now reports startup state, database health, LLM availability, schema completeness, and `pgvector` status.
- The frontend now retries backend health checks and shows a clearer message when the API is down or degraded.
- The shared AWS environment should not rely on app-driven database creation; provision the database explicitly.

## Known Follow-Up Gaps
These are still important before broader rollout:
- authentication and authorization for internal users
- non-local CORS configuration
- reverse proxy and TLS setup
- formal backup and restore runbook
- migration from local disk artifacts to S3 if the environment needs stronger durability
- move long-running jobs to a durable queue if concurrency grows

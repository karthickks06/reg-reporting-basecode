# System Requirements

## Supported Local Environment
- OS: Windows 10/11, Linux, or macOS
- Native mode: Python 3.11+ and Node.js/npm
- Container mode: Podman or Docker with Compose support
- Node.js: 18+
- npm: 9+

## Runtime Services
- Frontend: `localhost:3000`
- API: `localhost:<API_PORT>` (`API_PORT` from `.env`)
- Native database: SQLite under `data/reg_reporting_local.db`
- Container database: Postgres at `localhost:5431` (default)

## External Dependency
- OpenAI-compatible LLM gateway configured by:
  - `AXET_LLM_URL`
  - `AXET_LLM_MODEL`

## Recommended Host Capacity
- CPU: 4 logical cores minimum
- RAM: 8 GB minimum, 12+ GB preferred
- Disk: at least 5 GB free for containers, logs, and artifacts

## Writable Paths
- `data/artifacts/`
- `data/synthetic/`
- `data/exports/`
- `data/chroma/`

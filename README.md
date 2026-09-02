# Dentist on Call

Secure bilingual internal management PWA for dental care operations. The project is in Phase 1: foundation and development tooling only.

## Prerequisites

- Node.js 20.9+ and pnpm 10+
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Docker Desktop (for PostgreSQL and MinIO)

## Quick start

1. Copy `.env.example` to `.env` and replace every development secret before deploying anywhere shared.
2. Start local services: `docker compose --env-file .env up -d`.
3. Install web packages: `pnpm --dir apps/web install`.
4. Install API packages: `uv sync --project apps/api --all-groups`.
5. Start the API: `uv run --project apps/api uvicorn app.main:app --reload --port 8000`.
6. Start the web app in another terminal: `pnpm --dir apps/web dev`.

The temporary foundation page is available at `http://localhost:3000`; the API health endpoint is `http://localhost:8000/api/v1/health`.

## Useful commands

| Area | Command |
|---|---|
| Web lint | `pnpm --dir apps/web lint` |
| Web type check | `pnpm --dir apps/web typecheck` |
| API lint | `uv run --project apps/api ruff check .` |
| API type check | `uv run --project apps/api mypy app` |
| API tests | `uv run --project apps/api pytest` |
| Create migration | `uv run --project apps/api alembic revision --autogenerate -m "description"` |
| Apply migrations | `uv run --project apps/api alembic upgrade head` |

## Safety notes

- `.env` is intentionally ignored. The sample values are not production secrets.
- MinIO is private development storage only. Phase 7 will add signed-access, scanning, and attachment policy enforcement.
- No patient or medical data is cached offline in the foundation PWA shell.

See [the approved architecture review](outputs/architecture-review.md) for the model and implementation sequence.

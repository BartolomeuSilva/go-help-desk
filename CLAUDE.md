# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

- **`docs/DESIGN.md`** — the product specification (*what* to build). Read it before implementing any feature; if a requirement is ambiguous, ask.
- **`.claude/CLAUDE.md`** — the engineering playbook (*how* to build): TDD workflow, Go conventions, error handling, testing rules, and scope/version discipline. Its instructions are authoritative and override defaults. This file does not repeat them.
- `docs/code-conventions.md`, `docs/manual_operador.md` — supplementary references.

## Big picture

Go Help Desk is a self-hosted ticketing system that ships as a **single Go binary serving both the JSON API and the compiled React SPA on one port (`:8080`)**. PostgreSQL is the only external dependency.

The React app is embedded into the binary at build time via `go:embed` (`backend/internal/ui/ui.go` embeds `backend/internal/ui/dist`). **Consequence:** the frontend must be built and its `dist/` copied into the embed path *before* the Go binary is compiled. The Docker build (`backend/Dockerfile`) does this in stages: `node` builds the SPA → its `dist` is copied to `internal/ui/dist` → `golang` compiles. Locally, the embedded `dist` may be stale; for frontend work run Vite separately (see below).

DB migrations are embedded too (`backend/internal/database/migrate.go`, golang-migrate) and **run automatically on startup** — there is no manual migrate step.

## Backend architecture: the per-domain triad

Each feature is split across three layers, named consistently by domain (`ticket`, `user`, `category`, `customfield`, `group`, `tag`, `kb`, `canned`, `sla`, `auth`, `plugin`, …):

1. **`internal/domain/<x>`** — pure business logic. No HTTP, no SQL, no framework. Dependencies point *inward*; this package must not import `database`, `server`, or `dbgen`. Persistence is reached through an interface the domain defines and the store satisfies.
2. **`internal/database/<x>store`** — implements the domain's persistence interface using sqlc-generated code.
3. **`internal/server/handler_<x>.go`** — HTTP handlers; translate requests to domain calls and domain errors to status codes. Logging happens here and in `main`, never in domain code.

`cmd/server/main.go` is the composition root: it opens the DB, constructs every store, injects stores into domain services, wires services into the HTTP server, and starts MCP. Wiring is explicit and verbose by design — no global state, no side-effecting `init()`.

Other backend pieces:
- `internal/dbgen` — **sqlc-generated; never hand-edit.** Regenerate after changing SQL (see below).
- `internal/mcp` — MCP server exposing help-desk operations to AI assistants.
- `internal/middleware` — auth/session middleware.
- `internal/integration/whatsapp`, `docker/OpenWA` — WhatsApp channel.
- `internal/domain/plugin` — sandboxed WASM plugin runtime.
- Real-time ticket updates use a per-ticket Server-Sent-Events broker (`internal/server/sse.go`): handlers call `s.sseBroker.Broadcast(ticketID, "refresh", "")` after a mutation; the SPA subscribes at `/api/v1/tickets/{id}/events` and refetches.

### sqlc workflow

Raw SQL lives in `backend/queries/`; the schema is the migration set in `backend/internal/database/migrations/`. Config is `backend/sqlc.yaml` (note the UUID/`text[]` type overrides). After editing queries or migrations, regenerate from `backend/`:

```sh
cd backend && sqlc generate
```

## Frontend architecture

Vite + React + TypeScript, under `frontend/`. Routing is **TanStack Router** (`src/router.tsx`, typed routes like `/tickets/$id`), server state is **TanStack Query**, client state is **Zustand** (`src/store/*` — `auth`, `language`, `notifications`). API calls are thin wrappers in `src/api/*` over a shared axios `client`.

**i18n is mandatory and compile-enforced.** Every UI string is a key in `src/i18n/translations.ts` with both `pt` and `en` entries; omitting one is a TypeScript error. Default language is `pt` (Brazilian Portuguese). Use `const { t } = useT()` and `t('some.key')` — never hardcode user-facing text. See `src/i18n/TRANSLATION_RULE.md`.

Static assets in `frontend/public/` are served from the web root (e.g. `public/notification.mp3` → `/notification.mp3`).

## Common commands

```sh
# Run the whole app (API + SPA on http://localhost:8080)
docker-compose -f docker/docker-compose.yml up --build

# Frontend dev (hot reload; proxies API to the backend)
cd frontend && npm install && npm run dev
npm run build            # tsc -b + vite build (also the embed input)
npm run lint

# Backend unit tests (no DB)
cd backend && go test ./internal/domain/... ./internal/config/... ./internal/middleware/... ./internal/server/notify/...

# Integration tests (auto-skip when TEST_DATABASE_URL is unset)
docker-compose -f docker/docker-compose.yml --profile test run --rm test
# …or from the host with Postgres on :5432
cd backend && TEST_DATABASE_URL="postgres://helpdesk:helpdesk@localhost:5432/helpdesk?sslmode=disable" go test ./...

# Single test
cd backend && go test ./internal/domain/ticket/ -run TestCreateTicket -v

# Regenerate sqlc code after SQL changes
cd backend && sqlc generate
```

## First run

On a fresh database the app redirects to `/setup` to create the first admin account; the route is permanently disabled once any user exists (`GET /api/v1/setup/status`, `POST /api/v1/setup`).

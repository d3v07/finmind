# FinMind Implementation Phase Checklist

Last updated: February 8, 2026

## Phase 1: Foundation and Reliability

- [x] Secrets validation screen blocks research when critical keys are missing.
- [x] Provider diagnostics endpoint + UI status chips.
- [x] Query-level token and cost display.
- [x] Budget guardrails before query execution.
- [x] Retry/circuit-breaker utilities implemented in system layer.
- [x] Request tracing (`x-request-id`) and structured API logs.

## Phase 2: Research Core and Guided UX

- [x] Guided workflows with fixed paths and constrained short responses.
- [x] Advanced mode with verbosity controls.
- [x] Session create/list/select flows.
- [x] Artifact rendering (charts, comparison table, macro/earnings/news/options/filings/transcript/ownership).
- [x] Markdown rendering and source links.
- [x] Export per response (PDF/Markdown/JSON).

## Phase 3: Portfolio and Watchlist Intelligence

- [x] Watchlist create/add/remove flows.
- [x] Portfolio CSV import UI wired to backend.
- [x] Portfolio insights view (value, factor exposure, sector heatmap, rebalance suggestions).
- [x] Position sizing assistant UI + API.
- [x] Alerts create/list/evaluate UI + API.

## Phase 4: Collaboration and Distribution

- [x] Feature Lab for workspaces, comments, approvals, share links.
- [x] Distribution logs and webhook registration/testing.
- [x] One-click report composer and weekly brief generation.
- [x] Session memory summaries.

## Phase 5: UX and Product Polish

- [x] Full app-shell redesign (header/sidebar/content hierarchy).
- [x] Removed duplicate nav/branding clutter.
- [x] Startup guide for first-time users (per-user persisted state).
- [x] Navigation icons and dashboard mini-sparklines.
- [x] Dedicated pages for Dashboard/Research/Watchlist/Portfolio/Alerts/Documents/Comparisons.
- [x] Dark mode toggle with persisted preference.
- [x] Smoother transitions and cleaner card/table states.

## Phase 6: API Documentation and Developer Experience

- [x] REST docs endpoint (`/api/docs`) and markdown docs (`/api/docs.md`).
- [x] OpenAPI spec (`/api/openapi.json`) + Swagger UI (`/api/swagger`).
- [x] tRPC procedure index (`/trpc`) with guidance payload.
- [x] `/trpc` empty-path guard returns explicit NOT_FOUND guidance instead of opaque error.
- [x] Swagger request/query examples for major POST/GET routes.

## Validation Run (local)

- [x] `npm --prefix apps/web run -s typecheck`
- [x] `npm --prefix apps/web run -s lint`
- [x] `npm --prefix apps/web run -s build`
- [x] `npm --prefix apps/api run -s typecheck`
- [x] `npm --prefix apps/api run -s lint`
- [x] `npm --prefix packages/shared run -s typecheck`
- [x] `npm --prefix packages/shared run -s lint`

## Notes

- Local runtime in this environment does not have `bun` in PATH, so `bun run ...` commands were not used for validation.
- Repo is not currently a Git worktree in this path (`.git` missing), so Git status/commit operations were not available here.

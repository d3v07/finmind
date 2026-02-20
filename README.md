# FinMind

FinMind is a full-stack financial research workspace that wraps a Dexter-style agent flow behind a web UI.

## What Works Now
- JWT auth (register/login/me)
- Session management (create/list)
- Query execution and query history per session
- Agent adapter with four modes:
  - `dexter` (recommended, executes the Dexter agent via subprocess)
  - `openrouter` (direct model call without tool execution)
  - `mock` (offline fallback)
  - `auto` (tries Dexter first, falls back as needed)
- Guided workflow buttons + advanced research mode in UI
- Expanded guided preset library (swing trade, earnings trade, pair trade, and additional templates)
- Markdown rendering for responses (no raw `###`/`**` tokens in UI)
- Dedicated top-level app views: Dashboard, Research, Watchlist, Portfolio, Alerts, Documents, Comparisons, Settings
- First-run startup guide for new users + persisted dark mode toggle
- Artifact rendering:
  - inline price trend charts (single + multi-ticker)
  - side-by-side comparison metrics table for pair analysis
  - macro context cards (proxy basket with chart-derived fallback)
  - earnings calendar card (date confidence + source links)
  - 7-day news sentiment timeline + headline sentiment pills
  - options activity summary card (signal + call/put ratio extraction)
  - ownership trend card (institutional + insider direction)
  - filing change detector card (recent filing deltas + risk chip)
  - transcript Q&A extraction card (question/answer summaries + sentiment)
  - source confidence badges, contradiction check, assumption stress scenarios, thesis memory evolution
  - multi-agent orchestration trace (planner/collector/critic)
  - clickable source links (from Dexter web/filings tool calls)
- Export actions per response: PDF, Markdown, JSON
- Guided short-output mode + advanced depth control
- Feature Lab module with:
  - command palette + keyboard shortcuts
  - saved view presets
  - one-click report composer
  - portfolio import, factor/concentration heatmap, rebalance suggestions, position sizing
  - ticker/scenario alerts
  - decision journal
  - shared workspace/member roles
  - comments/annotations, approval workflow, expiring share links
  - Slack/Discord/Email distribution logs + webhook registration/test
  - enterprise controls: SSO provider settings, billing quotas, compliance controls, white-label theme/domain
  - weekly brief generation + session memory summary
- Provider diagnostics panel (OpenRouter / Financial Datasets / Exa)
- Secrets validation endpoint + startup blocker modal for critical missing secrets
- Query usage + cost metering shown per response
- Budget guardrails (daily/monthly/session/per-query caps)
- Async research queue endpoints with job polling
- Query execution timeline artifacts for auditability
- Watchlist management (create watchlist, add/remove tickers)
- REST API and tRPC API exposed from the same backend
- Persistent local storage via JSON file (`.finmind/data.json`) by default

## Product Roadmap
- Full market gap analysis + 50-feature phased checklist:
  - `docs/PRODUCT_GAP_ANALYSIS_AND_50_FEATURE_ROADMAP.md`
- Current implementation checklist:
  - `docs/IMPLEMENTATION_PHASE_CHECKLIST.md`

## Tech Stack
- Backend: Bun, Express, tRPC, Zod
- Frontend: React 19, Vite
- Shared package: Zod schemas + types
- Optional DB scaffolding: Drizzle + MySQL/TiDB

## Monorepo Layout
- `apps/api` backend server
- `apps/web` frontend app
- `packages/shared` shared types/schemas

## Local Development

If `bun` is not on your PATH, use the wrapper script `./scripts/bun` instead of `bun`.

1. Install dependencies:
```bash
./scripts/bun install
```

2. Start API (port `3001`):
```bash
./scripts/bun run dev:api
```

3. Start web app (port `5173`):
```bash
./scripts/bun run dev:web
```

4. Open:
- Web: `http://localhost:5173`
- Health: `http://localhost:3001/health`
- API Docs (JSON): `http://localhost:3001/api/docs`
- API Docs (Markdown): `http://localhost:3001/api/docs.md`
- OpenAPI Spec: `http://localhost:3001/api/openapi.json`
- Swagger UI: `http://localhost:3001/api/swagger`

## Environment
Copy `.env.example` to `.env` in repo root.

Recommended live mode:
```env
FINMIND_AGENT_MODE=openrouter
OPENROUTER_API_KEY=...
FINANCIAL_DATASETS_API_KEY=...
EXASEARCH_API_KEY=...
```

## Validation Commands
```bash
./scripts/bun run lint
./scripts/bun run typecheck
./scripts/bun run test
```

# FinMind

Financial research workspace with agent-driven analysis and multi-perspective artifact rendering.

Designed for traders and analysts who want to combine real-time data (news, filings, options activity, earnings) with structured reasoning (multi-agent Q&A, thesis memory, contradiction detection).

## Evidence

**Agent system** — Subprocess-based agent (Dexter) executes 3 roles (Planner/Collector/Critic) with tool access to:
- Real-time pricing (Exa)
- Financial datasets (company filings, earnings calendars, ownership trends)
- Web search (news, sentiment)

(`apps/api/src/dexter/`)

**Artifact rendering** — 10+ structured output types for research context:
- Price trend charts (single + multi-ticker)
- Comparison metrics tables (pair analysis)
- Earnings calendar + macro context
- Options activity summary (call/put ratio)
- Ownership trends (institutional + insider direction)
- Filing change detector (recent SEC filing deltas)
- Transcript Q&A (earnings call summaries)
- Contradictions + confidence badges
- Thesis memory evolution

(`apps/api/src/features/research/artifacts.ts`)

**Research templates** — 3 guided modes for structured workflows:
- Swing trade setup analysis
- Earnings trade thesis building
- Pair/spread trade comparison

(`apps/web/src/pages/Research.tsx` → guided mode UI)

**Workspace** — Multi-user research environment with:
- Persistent sessions (query history, saved views)
- Watchlist management (add/track tickers)
- Decision journal (reasoning log)
- Member roles + approval workflow
- Comments/annotations on analysis
- Export (PDF, Markdown, JSON per response)

(`apps/api/src/features/workspace/`)

**Authentication** — JWT-based auth with bcrypt-hashed passwords, session persistence.

(`apps/api/src/auth/`)

**Stack** — Bun runtime, Express backend, tRPC API, React 19 frontend, Zod validation, Drizzle ORM (optional), persistent JSON storage via `.finmind/data.json`.

## How It Works

1. **User launches research session** → Frontend loads Research page with guided + advanced modes
2. **Guided mode** → Preset templates (swing trade, earnings, pair trade) populate a thesis structure
3. **User submits query** → Express backend routes to agent orchestrator
4. **Agent runs** → Dexter subprocess executes 3-role planner/collector/critic flow with tool calls (web search, data APIs)
5. **Artifacts render** → Response is parsed into structured output (charts, tables, calendars, contradiction flags) and displayed inline
6. **User exports** → PDF/Markdown/JSON export per response
7. **Workspace persists** → Session history saved, watchlist tracked, decision journal kept

## Setup

### Prerequisites
- Bun 1.3.8+
- Optional: MySQL/TiDB for persistent database (file-based JSON default)

### Install
```bash
./scripts/bun install
```

### Run Tests
```bash
./scripts/bun run test
```

### Run Locally
```bash
# Terminal 1: API (port 3001)
./scripts/bun run dev:api

# Terminal 2: Web (port 5173)
./scripts/bun run dev:web
```

Visit `http://localhost:5173`.

### Environment Variables
```bash
FINMIND_AGENT_MODE=openrouter  # or 'dexter' (default) or 'mock'
OPENROUTER_API_KEY=...         # For direct LLM calls
FINANCIAL_DATASETS_API_KEY=... # Company filings, earnings, ownership data
EXASEARCH_API_KEY=...          # Web search
```

## Testing
```bash
./scripts/bun run lint
./scripts/bun run typecheck
./scripts/bun run test
```

## Roadmap
- Full 50-feature gap analysis: `docs/PRODUCT_GAP_ANALYSIS_AND_50_FEATURE_ROADMAP.md`
- Implementation checklist: `docs/IMPLEMENTATION_PHASE_CHECKLIST.md`

## License
MIT

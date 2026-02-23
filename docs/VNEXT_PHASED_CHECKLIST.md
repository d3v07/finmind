# FinMind vNext - Phased Checklist

This is the execution checklist for the next round of improvements (beyond the current baseline).

Legend:
- [x] done
- [ ] pending

## Phase 1 - Output + UX (Fast Wins)

- [x] Add `artifacts.structuredBrief` (sections + follow-up actions) to query results.
- [x] Render the structured brief as UI cards in the Research feed.
- [x] Add follow-up buttons that run concise next-step queries (guided/advanced).
- [x] Collapse long markdown responses behind a `Full analysis` expander by default when a brief exists.
- [x] Strip outer markdown code fences server-side so headings do not render as raw `##`.
- [ ] Add a density toggle (Compact vs Research) and persist it per user.
- [ ] Add a right-side Data Drawer (Sources, Charts, Timeline) to reduce vertical scrolling.
- [ ] Add streaming/progressive rendering for long runs (show artifacts as they arrive).

Acceptance checks:
- Guided runs show Brief cards without requiring scrolling through raw markdown.
- Clicking a follow-up action produces a new query and keeps costs visible.

## Phase 2 - Charting + Comparisons

- [ ] Add overlay toggle for multi-ticker charts (stacked vs overlay).
- [ ] Add drawdown + volatility + correlation panels for any ticker pair.
- [ ] Add event markers (earnings, major headlines) on charts.
- [ ] Add chart/table export (PNG + CSV) in addition to PDF/MD/JSON.

Acceptance checks:
- Comparing two tickers shows two separate charts and an optional overlay.
- A user can export the comparison table as CSV.

## Phase 3 - Evidence Mode (Trust)

- [ ] Add a Sources panel with per-source metadata (domain, date, snippet).
- [ ] Add citation linking from Brief bullets to evidence items.
- [ ] Add contradiction explanation when the critic flags conflicts.

Acceptance checks:
- Every Brief bullet shows at least one evidence link when web sources exist.

## Phase 4 - Async Runs + Cost Controls

- [ ] Make advanced queries run async by default with progress/status.
- [ ] Add caching/dedupe (repeat query reuse within a configurable window).
- [ ] Add “force refresh” vs “use cached” per query.

Acceptance checks:
- Long runs do not block the UI; user can navigate away and return.
- Identical prompts within 10 minutes do not re-spend tokens unless forced.

## Phase 5 - Admin Operations (Real Admin, Not User UI)

- [ ] Add server-side pagination/filtering for `/api/admin/*` lists.
- [ ] Add user controls: lock/unlock, revoke sessions/tokens, reset budget caps.
- [ ] Add per-user spend/budget policy enforcement.
- [ ] Add feature flags controlled from Admin (rollout %, allowlist).

Acceptance checks:
- Admin can search users and see high-cost accounts instantly.
- Admin can block a user from running new queries.

## Phase 6 - Architecture + Quality

- [ ] Split `/apps/web/src/App.tsx` into route-based modules (`UserApp`, `AdminApp`, shared components).
- [ ] Introduce a small component library (Button/Card/Table/Drawer/Toast) to remove CSS drift.
- [ ] Add integration tests for auth + admin RBAC + research execute.
- [ ] Add a DB-backed repository option (keep file repository for local dev).

Acceptance checks:
- The web app builds with < 1,000 LOC per top-level page file.
- RBAC tests prove `/api/admin/*` is unreachable by non-admin users.


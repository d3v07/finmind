# FinMind Replan V2

## Product Direction

FinMind stays focused on the same core idea: AI-assisted stock research.

The product now prioritizes one high-value workflow:

1. Watch live market data for your symbols.
2. Drill into intraday trend and key levels for a selected ticker.
3. Run guided or advanced AI analysis from the same screen.

## UX Replan

- Replaced the overloaded multi-view UI with a single command-desk layout.
- Reduced clicks by keeping watchlist, chart, and research in one workspace.
- Added quick-prompt chips and clearer loading/error states.
- Designed mobile-responsive breakpoints for real use on laptops and phones.

## Data Replan (Real-Time APIs)

- Added live quote endpoint: `GET /api/market/realtime?symbols=...`
- Added intraday chart endpoint: `GET /api/market/history/:ticker?range=1d&interval=5m`
- Data source: Yahoo Finance-style public endpoints through backend proxy.
- Added request timeout and partial-failure handling to avoid hard UI failures.

## Engineering Replan

- Split market API logic into dedicated module: `apps/api/src/market/realtime.ts`
- Added frontend market utility module for formatting and symbol normalization.
- Introduced poll-based live refresh every 20 seconds from the web app.

## Quality Replan

- Added backend tests for market normalization, fallback behavior, and history parsing.
- Added frontend tests for symbol normalization and display format utilities.
- Verified with `lint`, `typecheck`, and full test suite.

## Next Milestones

1. Add server-side caching + stale-while-revalidate for heavy market routes.
2. Add watchlist persistence in backend by user (instead of browser-only).
3. Add notifications for alert triggers and pre-market earnings events.
4. Add E2E browser tests for auth, watchlist updates, and research runs.

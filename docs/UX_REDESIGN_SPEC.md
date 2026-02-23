# FinMind UX Redesign Spec (Ticker-First, Dark, Terminal-Grade)

Date: 2026-02-09

## Intent
FinMind should feel like a modern, web-native "terminal": fast, dense, data-forward, and evidence-driven.
The product should be usable by non-SDE finance users (analysts, PMs, active traders) without training.

Non-goals:
- A generic "chat app" UI.
- Decorative gradients/patterns that compete with data readability.

## Primary Personas

### 1) Active Retail / Trader
Needs:
- Fast ticker lookup, price context, catalyst scan, trade plan.
- Alerts and watchlist monitoring.
- Compact outputs and clear risk framing.

Success metric:
- From login to a decision-ready short brief in < 60 seconds.

### 2) Fundamental Analyst
Needs:
- Fundamentals/valuation snapshots, filings/transcripts/news evidence.
- Side-by-side comparisons, source confidence, exports.
- Notes and repeatable research workflows.

Success metric:
- Create an exportable memo with sources in < 10 minutes.

### 3) PM / Portfolio Owner
Needs:
- Portfolio lens: concentration, exposure, scenario risks.
- "What changed since last time?" monitoring.
- Approval/sharing and auditability.

Success metric:
- Identify top risks and actions across the book in < 5 minutes daily.

## Product Philosophy (Terminal-Grade)
- Ticker-first: everything starts with universal search and a ticker page.
- Structure-first: cards/tables/charts first; long narrative is secondary and collapsed.
- Evidence-first: sources and timestamps are visible, not hidden.
- Actions-first: "Add alert", "Add to watchlist", "Compare", "Export" are always one click away.
- Density control: Comfort vs Dense mode, per user.
- Keyboardable: command palette + shortcuts for power users.

## Information Architecture (User App)
Top-level modules (left nav):
1. Dashboard (Today)
2. Watchlists (monitor)
3. Tickers (search + recents)
4. Compare (side-by-side)
5. Research (sessions / notebooks)
6. Alerts (rules + triggered)
7. Portfolio (positions + sizing)
8. Reports (exports + saved memos)
9. Settings (providers/budgets/preferences)

Admin is separate at `/admin` with its own shell.

## Global Layout

### Header (always visible)
- Brand mark + name (once)
- Universal search (typeahead)
- Command palette trigger
- Notifications/alerts badge
- User menu

### Three-pane workspace
- Left: nav + watchlists + pinned tickers (collapsible)
- Center: page content (ticker / compare / research)
- Right: Data Drawer (toggle)
  - Sources, timeline, exports, pinned artifacts

## Core Pages

### A) Ticker Page (Anchor Page)
Route: `/ticker/:symbol`

Header:
- Symbol, last price, daily change, range selector
- Actions: Brief, Compare, Alert, Export, Add to Watchlist

Tabs:
- Overview: structured brief + key metrics + price chart
- Fundamentals: metrics table + comparisons
- News: sentiment timeline + top headlines + sources
- Earnings: next date + scenario checklist
- Filings: change detector + risk level
- Options: signal + highlights
- Notes: session-linked notes + pins
- Alerts: existing rules for this ticker

### B) Compare
Route: `/compare?left=AAPL&right=MSFT`
- Synchronized charts (stacked + overlay toggle)
- Metrics table
- Winner summary (structured)
- Export table as CSV, charts as PNG

### C) Research (Notebook)
Route: `/research/:sessionId`
- Notebook feed of artifacts (brief cards, charts, tables)
- Prompt bar + playbooks
- Pins sidebar for key outputs
- Long markdown always collapsible

### D) Dashboard (Today)
Route: `/dashboard`
- Watchlist movers
- Upcoming earnings
- Triggered alerts
- Recent research
- Top "what changed" items

## Visual Design System (Dark Terminal)

### Principles
- High contrast, minimal blur, minimal background noise.
- Color conveys meaning (up/down/risk), not decoration.
- Monospace for tickers and numbers; sans for labels.

### Tokens (initial)
- Background: near-black navy
- Panels: deep slate
- Lines: muted blue-gray
- Ink: near-white; muted ink stays readable
- Accent: cyan/blue for interaction
- Up: green, Down: red, Warning: amber

### Density Modes
- Comfort: larger type, more spacing, fewer columns
- Dense: smaller spacing, more columns, sticky headers, virtualization

## Interaction Rules
- Any generated long text is behind "Full analysis".
- Any card/table has:
  - "Pin"
  - "Export"
  - "Open in research"
- Sources: show as badges + open in drawer, not a wall of links.

## Phase Plan (Execution)

### Phase 0: Spec + Audit (1-2 days)
- Produce this spec, acceptance criteria, and a page-by-page mapping to current components.

### Phase 1: Frontend Foundation (2-4 days)
- Add route/page structure and component primitives.
- Split legacy monolith into `UserApp` + `AdminApp`.
- Add density toggle (Comfort/Dense) and persist.

### Phase 2: Universal Search + Ticker Page (3-6 days)
- Implement `/ticker/:symbol` with existing artifacts.
- Add quick actions and follow-up playbooks.

### Phase 3: Compare + Charting Upgrade (4-8 days)
- Better charting (overlay, sync, markers) + CSV/PNG exports.

### Phase 4: Research Notebook UX (3-6 days)
- Notebook feed, pins, drawer, exports, "what changed" diffs.

### Phase 5: Monitoring (4-8 days)
- Alerts UX + daily brief + dashboard improvements.

### Phase 6: Polish + Performance (ongoing)
- Virtualization, accessibility, keyboard-first flows, performance budgets.


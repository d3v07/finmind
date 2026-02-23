# Logging Strategy

## Goals
- Track API reliability and latency.
- Correlate user requests with Dexter runs.
- Avoid sensitive-data leakage in logs.

## Format
Use structured JSON logs with these fields:
- `timestamp`
- `level` (`debug`, `info`, `warn`, `error`)
- `service` (`api`, `worker`, `web`)
- `requestId`
- `route` or `procedure`
- `durationMs`
- `message`
- `error` (sanitized)

## Rules
- Never log API keys, tokens, JWTs, or raw auth headers.
- Truncate large payloads and user text for info-level logs.
- Use error-level logs for failed tool calls and external API failures.
- Keep one requestId from ingress through Dexter execution.

## Retention
- Keep info logs for 14 days.
- Keep error logs for 30 days.
- Archive aggregated metrics separately.

# Supabase Runtime Instructions

## Focus

This directory is the execution runtime for CalGPT tool handlers.

## Rules

- Keep the deployed function route compatible with `SUPABASE_MCP_ENDPOINT`.
- Prefer schema-tolerant reads when production data may drift.
- Treat auth, endpoint wiring, and migration history as production-critical.
- Do not introduce query assumptions that fail on duplicate rows or partial migrations without adding safeguards.
- When runtime behavior changes, update `docs/runbook.md` if the failure mode is operationally relevant.

## Validation

- redeploy the function and verify direct endpoint health with anon key
- verify `tools/call sync_state` and `tools/call get_progress` through Vercel MCP

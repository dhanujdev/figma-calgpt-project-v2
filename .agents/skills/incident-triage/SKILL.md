---
name: incident-triage
description: Diagnose CalGPT production failures quickly. Use when errors include 404 endpoint failures, unknown methods, migration drift, or stale widget behavior.
---

1. Identify whether the failure is in Vercel MCP, Supabase routing, schema state, or widget rendering.
2. Check for these known patterns first:
   - wrong `SUPABASE_MCP_ENDPOINT`
   - Supabase function path mismatch
   - local vs remote migration drift
   - duplicate-row query failures
3. Use direct endpoint probes before reconnecting ChatGPT.
4. Update `docs/runbook.md` only if the incident reveals a new repeatable failure pattern.

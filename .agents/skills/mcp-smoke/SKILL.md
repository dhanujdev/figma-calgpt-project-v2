---
name: mcp-smoke
description: Verify CalGPT MCP health and isolate gateway, resource, or tool-call failures. Use when MCP routing, widget loading, or connector behavior is suspect.
---

1. Probe `initialize`, `tools/list`, `resources/list`, `resources/read`, `sync_state`, and `get_progress`.
2. If `tools/list` works but `tools/call` fails, test the direct Supabase function endpoint next.
3. Distinguish gateway issues, function routing issues, and data/runtime issues in the report.
4. Use `npm run smoke:mcp` with `MCP_BASE_URL` when possible.
5. Reference `docs/contracts/mcp.md` and `docs/runbook.md` only if the failure touches contract or recovery behavior.

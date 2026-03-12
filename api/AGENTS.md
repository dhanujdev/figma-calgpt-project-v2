# API Instructions

## Focus

This directory defines the public MCP surface and OAuth metadata endpoints.

## Rules

- Keep JSON-RPC behavior stable for `initialize`, `tools/list`, `resources/list`, `resources/read`, and `tools/call`.
- Do not change tool names, widget URI, or auth metadata casually.
- If tool inputs, outputs, or resource metadata change, update `docs/contracts/mcp.md`.
- If forwarding behavior changes, verify `SUPABASE_MCP_ENDPOINT` assumptions in `docs/deploy.md` and `docs/runbook.md`.

## Validation

- `npm run check:mcp-contract`
- `MCP_BASE_URL=https://figma-calgpt-project.vercel.app/mcp npm run smoke:mcp`

# CalGPT Repository Instructions

## Purpose

CalGPT is a ChatGPT App with a Vercel MCP gateway, a Supabase Edge Function runtime, and a vanilla widget UI.
Optimize for fast execution, contract safety, and production recovery.
Keep root context small. Use this file first, then load only the next document needed for the task.

## Canonical Entry Points

- `api/mcp.ts`: MCP JSON-RPC gateway, tool/resource contract, Supabase forwarding
- `supabase/functions/server/`: tool runtime, auth resolution, Postgres reads and writes
- `public/component.html`: widget UI rendered from MCP resource output

## Where To Read Next

- Product and repo overview: `README.md`
- Doc map: `docs/INDEX.md`
- MCP interface changes: `docs/contracts/mcp.md`
- Deploy and environment changes: `docs/deploy.md`
- Incident diagnosis: `docs/runbook.md`

## Working Rules

- Prefer the flow `ChatGPT -> api/mcp.ts -> Supabase function -> Postgres`.
- Do not add duplicate business logic to the React dev harness.
- Keep widget behavior aligned with MCP tool/resource contracts.
- Update `docs/contracts/mcp.md` only when tool or resource interfaces change.
- Update `docs/runbook.md` only for real failure patterns or recovery steps.

## Required Checks

- Run `npm run test:strict` after meaningful changes.
- Run live MCP smoke when backend, routing, or contract behavior changes:
  - `MCP_BASE_URL=https://figma-calgpt-project.vercel.app/mcp npm run smoke:mcp`
- Review the diff for contract drift and runtime risk before shipping.

## Non-Authoritative Artifacts

Ignore these unless the task explicitly targets them:

- `dist/`
- `node_modules/`
- `supabase/.temp/`
- one-off planning files such as `V2_UI_PLAN.md`

# Architecture

## Request Flow

1. ChatGPT sends JSON-RPC to `/mcp`.
2. Vercel rewrites `/mcp` to `api/mcp.ts`.
3. `api/mcp.ts` serves MCP metadata and forwards `tools/call` requests to Supabase.
4. Supabase Edge Function executes tool logic against Postgres.
5. ChatGPT renders widget content from `public/component.html` via `resources/read`.

## Main Components

### MCP Gateway

- File: `api/mcp.ts`
- Handles:
  - `initialize`
  - `ping`
  - `tools/list`
  - `resources/list`
  - `resources/read`
  - `tools/call`
- Owns tool metadata, widget URI, auth challenge metadata, and Supabase forwarding

### Supabase Runtime

- Directory: `supabase/functions/server/`
- Owns:
  - tool handlers
  - auth resolution
  - state assembly
  - SQL reads and writes

### Widget

- File: `public/component.html`
- Required bridge APIs:
  - `window.openai.toolOutput`
  - `window.openai.callTool`
  - `window.openai.setWidgetState`
  - `openai:set_globals`
  - `notifyIntrinsicHeight`

### Local Harness

- File: `src/app/App.tsx`
- Purpose:
  - local inspection
  - previewing widget behavior
  - debugging state fetches

## Data Model

Primary runtime tables:

- `nutrition_goals`
- `user_preferences`
- `meals`
- `daily_totals`
- `weight_entries`
- `progress_photos`
- `streak_events`
- `badge_events`

## Operational Boundaries

- Vercel uses `SUPABASE_ANON_KEY` to invoke the function endpoint.
- Supabase function uses `SUPABASE_SERVICE_ROLE_KEY` for DB access.
- User auth, if present, is forwarded from Vercel to Supabase as request metadata.

## Authoritative Docs

- Interface rules: [MCP Contract](./contracts/mcp.md)
- Deployment and keys: [Deploy](./deploy.md)
- Incident patterns: [Runbook](./runbook.md)

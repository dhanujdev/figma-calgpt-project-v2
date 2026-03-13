# Getting Started

## What CalGPT Is

CalGPT is a ChatGPT App for calorie tracking, progress analytics, and goal updates.
The production path is:

- ChatGPT -> `api/mcp.ts`
- `api/mcp.ts` -> Supabase Edge Function
- Supabase Edge Function -> Postgres
- ChatGPT widget -> `public/component.html`

## Local Work

```bash
npm install
npm run dev
```

Use the local harness for quick widget and gateway inspection.

## Required Runtime Configuration

### Vercel

- `SUPABASE_URL=https://jpjxpyhuawgyrhbnnqyb.supabase.co`
- `SUPABASE_ANON_KEY=<anon key>`
- `SUPABASE_MCP_ENDPOINT=https://jpjxpyhuawgyrhbnnqyb.supabase.co/functions/v1/server/mcp`
- `MCP_AUTH_MODE=oauth`
- `MCP_DEFAULT_TIMEZONE=America/New_York`

### Supabase function secrets

- `SUPABASE_URL=https://jpjxpyhuawgyrhbnnqyb.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service role key>`
- `ALLOW_DEMO_MODE=false`
- `MCP_DEFAULT_TIMEZONE=America/New_York`

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Vercel.

### Supabase auth setup

- Enable Google sign-in in Supabase Auth
- Turn on Supabase Auth OAuth Server
- Set the authorization path to `/oauth/consent`
- Allow `https://figma-calgpt-project-v2.vercel.app/oauth/consent` as a redirect URL

## Canonical URLs

- MCP connector: `https://figma-calgpt-project-v2.vercel.app/mcp`
- Direct MCP diagnostics: `https://figma-calgpt-project-v2.vercel.app/api/mcp`
- OAuth consent UI: `https://figma-calgpt-project-v2.vercel.app/oauth/consent`
- Protected-resource metadata: `https://figma-calgpt-project-v2.vercel.app/.well-known/oauth-protected-resource` when `MCP_AUTH_MODE=oauth`
- Authorization-server metadata: `https://figma-calgpt-project-v2.vercel.app/.well-known/oauth-authorization-server` when `MCP_AUTH_MODE=oauth`

## First Checks

```bash
npm run test:strict
MCP_AUTH_MODE=oauth MCP_BASE_URL=https://figma-calgpt-project-v2.vercel.app/mcp npm run smoke:mcp
```

If a live check fails, continue with [Runbook](./runbook.md).

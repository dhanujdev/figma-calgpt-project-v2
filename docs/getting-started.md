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

- `SUPABASE_URL=https://yaaslbgenkrimghcpeay.supabase.co`
- `SUPABASE_ANON_KEY=<anon key>`
- `SUPABASE_MCP_ENDPOINT=https://yaaslbgenkrimghcpeay.supabase.co/functions/v1/server/mcp`

### Supabase function secrets

- `SUPABASE_URL=https://yaaslbgenkrimghcpeay.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service role key>`
- `ALLOW_DEMO_MODE=false`

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Vercel.

## Canonical URLs

- MCP connector: `https://figma-calgpt-project.vercel.app/mcp`
- Direct MCP diagnostics: `https://figma-calgpt-project.vercel.app/api/mcp`
- Protected-resource metadata: `https://figma-calgpt-project.vercel.app/.well-known/oauth-protected-resource`
- Authorization-server metadata: `https://figma-calgpt-project.vercel.app/.well-known/oauth-authorization-server`

## First Checks

```bash
npm run test:strict
MCP_BASE_URL=https://figma-calgpt-project.vercel.app/mcp npm run smoke:mcp
```

If a live check fails, continue with [Runbook](./runbook.md).

# CalGPT V2

CalGPT V2 is a ChatGPT App for calorie tracking, progress analytics, goal updates, Google sign-in through Supabase Auth, and beta funnel measurement.
The production path is a thin MCP gateway on Vercel, a Supabase Edge Function runtime, and a vanilla widget UI rendered inside ChatGPT.

## Main Entry Points

- `api/mcp.ts`
- `supabase/functions/server/`
- `public/component.html`

## Quick Start

```bash
npm install
npm run dev
```

## Canonical Production URLs

- MCP connector: `https://figma-calgpt-project-v2.vercel.app/mcp`
- Direct MCP diagnostics: `https://figma-calgpt-project-v2.vercel.app/api/mcp`
- OAuth consent UI: `https://figma-calgpt-project-v2.vercel.app/oauth/consent`
- Widget URI: `ui://widget/gpt-calories-v13.html`

## Read Next

- Agent instructions: [`AGENTS.md`](./AGENTS.md)
- Documentation map: [`docs/INDEX.md`](./docs/INDEX.md)
- Analytics views: [`docs/analytics.md`](./docs/analytics.md)

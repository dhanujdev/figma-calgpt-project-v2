# CalGPT V2

CalGPT V2 is a ChatGPT App for calorie tracking, progress analytics, and goal updates.
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

- MCP connector: `https://figma-calgpt-project.vercel.app/mcp`
- Direct MCP diagnostics: `https://figma-calgpt-project.vercel.app/api/mcp`
- Widget URI: `ui://widget/gpt-calories-v4.html`

## Read Next

- Agent instructions: [`AGENTS.md`](./AGENTS.md)
- Documentation map: [`docs/INDEX.md`](./docs/INDEX.md)

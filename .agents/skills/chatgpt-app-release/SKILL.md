---
name: chatgpt-app-release
description: Release CalGPT across Vercel, Supabase, and ChatGPT connector paths. Use when shipping backend, widget, or contract changes.
---

1. Run `npm run test:strict`.
2. Verify the direct Supabase function endpoint.
3. Verify the public MCP endpoint and OAuth metadata endpoints.
4. Confirm widget resource URI and tool/resource alignment.
5. Reconnect ChatGPT only after backend and MCP health are green.

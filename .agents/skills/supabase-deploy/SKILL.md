---
name: supabase-deploy
description: Deploy CalGPT Supabase schema and edge function safely. Use when changing server runtime, schema, or endpoint wiring.
---

1. Verify migration history alignment before `db push`.
2. Apply SQL changes only after reconciling local and remote migration history.
3. Deploy the `server` function and verify the exact `SUPABASE_MCP_ENDPOINT` path with anon key.
4. Confirm Vercel is configured to the tested endpoint.
5. Finish with direct function probe plus Vercel MCP probe.

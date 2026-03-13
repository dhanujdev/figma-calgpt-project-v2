# Testing

## Required Local Gate

```bash
npm run test:strict
```

Current gate:

1. `check:mcp-contract`
2. `check:widget-contract`
3. `check:sql-migration`
4. `check:ui-shell`
5. `build`
6. `smoke:mcp` when `MCP_BASE_URL` is set

## Live MCP Smoke

```bash
MCP_BASE_URL=https://figma-calgpt-project-v2.vercel.app/mcp npm run smoke:mcp
```

Diagnostic fallback:

```bash
MCP_BASE_URL=https://figma-calgpt-project-v2.vercel.app/api/mcp npm run smoke:mcp
```

## Production Acceptance

### MCP health

- `POST /mcp initialize` -> `200`
- `POST /mcp tools/list` -> includes V1, V2, V3 tools
- `POST /mcp tools/call sync_state` -> success
- `POST /mcp tools/call get_progress` -> success

### OAuth metadata when enabled

- `GET /.well-known/oauth-protected-resource` -> `200` only when `MCP_AUTH_MODE=oauth`
- `GET /.well-known/oauth-authorization-server` -> `200` only when `MCP_AUTH_MODE=oauth`
- otherwise both routes should return `404`
- unauthenticated `tools/call` responses should include `_meta["mcp/www_authenticate"]`

### ChatGPT checks

1. Open the app from ChatGPT.
2. If prompted, sign in with Google through Supabase Auth.
3. Log a meal.
4. Confirm totals and meals update in the widget.
5. Ask for progress.
6. Update goals or preferences.
7. Confirm no endpoint or method errors appear.

### Beta metrics checks

1. Open Supabase SQL editor.
2. Run `select * from public.beta_funnel_summary;`
3. Run `select * from public.beta_prompt_dropoff;`
4. Run `select * from public.beta_empty_state_recovery;`
5. Run `select * from public.beta_retention_summary order by cohort_date desc limit 14;`
6. Confirm rows reflect recent production activity.

## Failure Triage Order

1. Verify `SUPABASE_MCP_ENDPOINT`.
2. Verify direct Supabase function response.
3. Verify Vercel `/mcp` tool-call behavior.
4. Verify migration history consistency.
5. Reconnect ChatGPT only after backend health is confirmed.

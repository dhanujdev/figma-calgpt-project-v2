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
MCP_BASE_URL=https://figma-calgpt-project.vercel.app/mcp npm run smoke:mcp
```

Diagnostic fallback:

```bash
MCP_BASE_URL=https://figma-calgpt-project.vercel.app/api/mcp npm run smoke:mcp
```

## Production Acceptance

### MCP health

- `POST /mcp initialize` -> `200`
- `POST /mcp tools/list` -> includes V1, V2, V3 tools
- `POST /mcp tools/call sync_state` -> success
- `POST /mcp tools/call get_progress` -> success

### OAuth metadata

- `GET /.well-known/oauth-protected-resource` -> `200`
- `GET /.well-known/oauth-authorization-server` -> `200`

### ChatGPT checks

1. Open the app from ChatGPT.
2. Log a meal.
3. Confirm totals and meals update in the widget.
4. Ask for progress.
5. Update goals or preferences.
6. Confirm no endpoint or method errors appear.

## Failure Triage Order

1. Verify `SUPABASE_MCP_ENDPOINT`.
2. Verify direct Supabase function response.
3. Verify Vercel `/mcp` tool-call behavior.
4. Verify migration history consistency.
5. Reconnect ChatGPT only after backend health is confirmed.

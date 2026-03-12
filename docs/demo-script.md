# Demo Script

Use this for product demos after the production path is healthy.

## Suggested Demo Flow

1. Log breakfast with calories and macros.
2. Log a snack.
3. Ask for the current daily summary.
4. Log dinner and show the totals change.
5. Update goals and show the progress view adapting.
6. Ask for a progress or coaching summary.

## Demo Guardrails

- Use production only after `npm run smoke:mcp` passes against the public MCP URL.
- Do not demo from stale ChatGPT sessions after backend or widget deploys.
- If the widget does not update, verify `sync_state` and `get_progress` directly before continuing.

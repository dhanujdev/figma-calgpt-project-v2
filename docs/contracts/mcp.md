# MCP Contract

## Protocol Surface

Public endpoint: `/mcp`

Supported JSON-RPC methods:

- `initialize`
- `ping`
- `tools/list`
- `resources/list`
- `resources/read`
- `tools/call`

## Resource Contract

- URI: `ui://widget/gpt-calories-v4.html`
- MIME: `text/html;profile=mcp-app`
- Resource source: `public/component.html`

## Tool Contract

### V1

- `log_meal`
- `sync_state`
- `delete_meal`
- `update_goals`

### V2

- `log_weight`
- `get_progress`
- `update_preferences`
- `upload_progress_photo`

### V3

- `run_daily_checkin`
- `run_weekly_review`
- `suggest_goal_adjustments`

## Stability Rules

- `sync_state` must remain no-argument compatible
- `tools/list` and `tools/call` must stay aligned
- `resources/list` must include the current widget URI
- `resources/read` must return widget HTML with the MCP app MIME

## Auth Signaling

- tool descriptors expose `securitySchemes`
- protected flows may return `_meta["mcp/www_authenticate"]`
- metadata endpoints:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server`

## Required Change Discipline

If any tool name, input shape, output shape, widget URI, or auth contract changes:

1. update this document
2. run `npm run test:strict`
3. run live smoke against the deployment path affected

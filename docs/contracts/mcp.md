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

- URI: `ui://widget/gpt-calories-v13.html`
- MIME: `text/html;profile=mcp-app`
- Resource source: `public/component.html`
- Widget behavior: read-only display for dashboard, progress, settings, daily check-ins, and weekly reviews. It now includes onboarding and empty-state prompt guidance. Users must ask the agent in chat for writes such as logging meals, deleting meals, logging weight, or updating goals/preferences.

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

### V4

- `get_user_profile`
- `get_recent_meals`
- `get_meal_suggestions`
- `save_agent_note`
- `get_agent_notes`
- `delete_agent_note`

## Structured Output Notes

- `sync_state` now includes `state.agentNotes`, an array of `{ key, value, updatedAt }`
- `sync_state` now includes `state.onboarding`, which carries `isNewUser`, a short summary, a suggested prompt, and starter prompts for cold-start users
- write-oriented tool outputs may include `actionSummary`, which carries a widget-friendly `{ title, summary, detailLines? }` trust-confirmation payload
- error payloads may include `telemetry`, which carries `{ toolName, widgetVersion, failureClass, error }` for debugging and support
- mutating tools may return `failureClass: "rate_limited"` with `retryAfterSeconds` when a user exceeds the shared write cap
- `sync_state` meals may include `estimationNotes` when a logged meal was estimated by the assistant
- `get_user_profile` returns goals, preferences, recent meal count, progress summary, agent notes, `isNewUser`, and `onboarding`
- `get_recent_meals` returns unique meal history ordered by frequency and recency
- `get_meal_suggestions` returns macro-aware suggestions filtered by durable diet preferences when available
- `save_agent_note` returns the saved note object
- `get_agent_notes` returns `notes`, ordered by `updatedAt` descending
- `delete_agent_note` returns success even when the key is absent
- `run_daily_checkin` may include short-horizon pattern observations such as protein deficits, skipped logging days, calorie overages, late-night eating, macro imbalance, and streak milestones
- `run_weekly_review` now includes `patterns`, `actionPlan`, and `goalProjection` in addition to the legacy `insights` summary

## Stability Rules

- `sync_state` must remain no-argument compatible
- `tools/list` and `tools/call` must stay aligned
- `resources/list` must include the current widget URI
- `resources/read` must return widget HTML with the MCP app MIME

## Auth Signaling

- production auth mode is `oauth`
- tool descriptors expose `securitySchemes`
- protected flows may return `_meta["mcp/www_authenticate"]` only when `MCP_AUTH_MODE=oauth`
- OAuth metadata and tool security now use Supabase-supported scopes: `openid`, `email`, and `profile`
- OAuth metadata endpoints exist only when `MCP_AUTH_MODE=oauth`:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server`
- user-scoped tools should challenge for OAuth in production instead of falling back to demo data

## Required Change Discipline

If any tool name, input shape, output shape, widget URI, or auth contract changes:

1. update this document
2. run `npm run test:strict`
3. run live smoke against the deployment path affected

# Widget Instructions

## Focus

This directory contains the ChatGPT widget UI.

## Rules

- Preserve required bridge integration points:
  - `window.openai.toolOutput`
  - `window.openai.callTool`
  - `window.openai.setWidgetState`
  - `openai:set_globals`
  - `notifyIntrinsicHeight`
- Do not move business logic from MCP or Supabase into the widget.
- Keep widget behavior aligned with `docs/contracts/mcp.md`.
- Use the React app only as a local harness, not as a second product UI.

## Validation

- `npm run check:widget-contract`
- manually verify `public/component.html` still renders from live tool output

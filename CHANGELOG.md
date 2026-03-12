# Changelog

All notable changes to this project are documented in this file.

## [2.0.2] - 2026-03-12

### Added
- root `AGENTS.md` plus nested instruction files for `api/`, `public/`, and `supabase/functions/server/`
- repo-local agent skills under `.agents/skills/` for MCP smoke, Supabase deploy, release, and incident triage
- `docs/INDEX.md` as the single human docs map

### Changed
- reorganized the repo for agent-first discovery with a thin root and progressive documentation under `docs/`
- merged operational and contract docs into focused pages under `docs/`
- moved supporting human-only material out of the root doc layer

## [2.0.1] - 2026-03-12

### Added
- incident prevention runbook coverage for concrete outage classes, root causes, and prevention checklists

### Changed
- rewrote core operational docs to align with current production architecture and endpoint wiring
- Clarified required env keys by runtime boundary (Vercel vs Supabase function secrets).
- Added explicit verification commands for Supabase endpoint health and MCP tool-call health.

## [2.0.0] - 2026-03-12

### Added
- SQL-first Supabase migration for goals, preferences, meals, daily totals, weight entries, progress photos, streak events, and badge events.
- New MCP tools: `log_weight`, `get_progress`, `update_preferences`, `upload_progress_photo`, `run_daily_checkin`, `run_weekly_review`, `suggest_goal_adjustments`.
- OAuth metadata discovery endpoints and MCP auth challenge signaling (`mcp/www_authenticate`).
- Strict release gate scripts and CI wiring (`npm run test:strict`).
- contract documentation and deployment/runbook updates

### Changed
- Widget template URI bumped to `ui://widget/gpt-calories-v4.html`.
- React app simplified to a widget-first dev harness (no duplicate feature UI).
- `sync_state` now supports optional `range` and `page` while remaining no-arg compatible.
- Supabase server layer refactored to SQL domain handlers with deterministic V3 coaching outputs.

### Fixed
- Prevented hard break risk before SQL migration by adding legacy KV fallback mode.
- Unified web app + widget tool contract to reduce API drift regressions.

## [1.0.0] - 2026-03-12

### Added
- Vercel MCP proxy endpoint with stable ChatGPT connector path at `/mcp`.
- Vercel state proxy endpoint at `/api/state`.
- MCP resource support (`resources/list`, `resources/read`) with ChatGPT Apps widget metadata.
- Tool descriptors wired with `_meta.ui.resourceUri` and `_meta["openai/outputTemplate"]`.
- Widget bridge updates to render from `window.openai.toolOutput` and `openai:set_globals`.
- formal release lock documentation

### Changed
- Upgraded frontend build stack lock to Vite `6.4.1`.
- Moved `react` and `react-dom` into runtime dependencies.
- Versioned widget template URI to `ui://widget/gpt-calories-v3.html` to avoid stale template cache issues.
- Aligned deployment/testing docs to Vercel MCP flow.

### Fixed
- Structured content flowing as text-only cards instead of rendering widget.
- Missing MCP `resources` capability wiring in initialize and tool metadata.
- Widget state sync behavior for repeated tool calls in ChatGPT.
- Date badge parsing edge case caused by `YYYY-MM-DD` timezone conversion behavior.

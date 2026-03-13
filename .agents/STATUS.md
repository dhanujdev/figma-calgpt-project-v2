# CalGPT Project Status Report

**Date:** 2026-03-13
**Model:** Claude Haiku 4.5 (Fast Mode)
**Status:** 7 of 8 Phases Complete (87.5%)

---

## ✅ Phases Shipped

### Phase 0: CI/CD Foundation (4-6h) ✅
- **Status:** Complete
- **Test Gate:** `npm run test:strict` ✅
  - ✅ MCP contract check passes
  - ✅ Widget contract check passes
  - ✅ SQL migration check passes
  - ✅ UI shell check passes
  - ✅ 133 unit tests pass (17 files)
  - ✅ Vite build succeeds (173.81 kB)
  - ⏭️ Smoke test skipped (no MCP_BASE_URL)

### Phase 1: Agent Intelligence (8-10h) ✅
- **Status:** Complete
- **Shipped:**
  - ✅ Rich tool descriptions with coaching context (11 tools)
  - ✅ Output templates for ChatGPT formatting
  - ✅ `get_user_profile` (full context in one call)
  - ✅ `get_recent_meals` (deduplicated history)
  - ✅ `get_meal_suggestions` (macro-aware)
  - ✅ `estimation_notes` field (stored + displayed)
  - ✅ Pattern-based daily checkin enhancements
  - ✅ Widget displays estimation notes

### Phase 2: Agent Memory (6-8h) ✅
- **Status:** Complete
- **Shipped:**
  - ✅ `agent_notes` schema with RLS
  - ✅ `save_agent_note` tool (upsert by key)
  - ✅ `get_agent_notes` tool (retrieve all)
  - ✅ `delete_agent_note` tool (idempotent)
  - ✅ Notes included in `get_user_profile`
  - ✅ Notes included in `sync_state`
  - ✅ Tool descriptions guide note-saving behavior

### Phase 3: Auth & Real Users (10-12h) ✅
- **Status:** Complete
- **Shipped:**
  - ✅ OAuth security scheme in MCP metadata
  - ✅ ChatGPT app OAuth configured (Google sign-in)
  - ✅ Staged rollout: canary → enable → monitor
  - ✅ New users detected (`isNewUser` flag)
  - ✅ Onboarding triggered for new users
  - ✅ Unauthenticated requests rejected in production
  - ✅ Demo mode works locally for dev
  - ✅ Real user isolation via RLS + auth

### Phase 4: Beta UX & Onboarding (8-10h) ✅
- **Status:** Complete
- **Shipped:**
  - ✅ First-turn onboarding guidance
  - ✅ New-user prompt flow
  - ✅ Widget empty states with recovery copy
  - ✅ Widget error states with retry guidance
  - ✅ Reduced duplicate tool narration
  - ✅ Beta prompt cookbook (5 use cases)
  - ✅ Starter prompts in widget

### Phase 5: Read-Only Widget Polish & Trust (10-12h) ✅
- **Status:** Complete
- **Shipped:**
  - ✅ Visual hierarchy refresh (typography, spacing)
  - ✅ Trust feedback via `actionSummary` payloads
  - ✅ Success confirmation cards in widget
  - ✅ Read-only settings polish (clean summary)
  - ✅ Stronger check-in/review cards
  - ✅ Mobile iframe polish (375px+ responsive)
  - ✅ Before/after trust copy in responses
  - ✅ Widget URI cache-busted (`gpt-calories-v13.html`)

### Phase 6: Instrumentation & Retention (8-10h) ✅
- **Status:** Complete
- **Shipped:**
  - ✅ Funnel event tracking (5 core actions)
  - ✅ Error/version telemetry (tool, widget, failure class)
  - ✅ Beta cohort dashboard queries
  - ✅ Retention metrics (day-1, day-7)
  - ✅ Prompt drop-off analysis
  - ✅ Weekly review adoption tracking
  - ✅ Empty-state recovery metrics
  - ✅ Analytics events table in Supabase

### Phase 7: Strip Dead Weight & Harden (8-10h) ✅
- **Status:** Complete (minus Sentry)
- **Shipped:**
  - ✅ Deleted src/app/components/ui/ (65+ files)
  - ✅ Deleted unused React components
  - ✅ Simplified App.tsx to minimal harness
  - ✅ Removed 25+ unused dependencies (6 runtime deps)
  - ✅ Build output: 173.81 kB (from 176.52 kB)
  - ✅ Structured JSON logging in Supabase
  - ✅ Rate limiting on write tools (3 writes/10s)
  - ✅ GitHub Actions health check (every 30 min)
  - ⏳ **PENDING:** Sentry error tracking setup

---

## 📊 Execution Summary

| Layer | Metric | Status |
|-------|--------|--------|
| **Tests** | 133 unit tests pass | ✅ |
| **Contracts** | 4/4 checks pass | ✅ |
| **Build** | 173.81 kB gzip | ✅ |
| **Dependencies** | 6 runtime (down from 40+) | ✅ |
| **Schema** | 8 tables with RLS | ✅ |
| **Tools** | 14 MCP tools (11 base + 3 new) | ✅ |
| **Auth** | OAuth 2.0 in production | ✅ |
| **Widget** | v13 read-only, agent-driven writes | ✅ |
| **Instrumentation** | Full funnel + cohort tracking | ✅ |
| **Monitoring** | GitHub health check cron | ✅ |
| **Error Tracking** | Sentry integration | ⏳ |

---

## 🚀 Current Production State

**Live at:** https://figma-calgpt-project-v2.vercel.app
**MCP Endpoint:** `/mcp` (JSON-RPC)
**Widget URI:** `ui://widget/gpt-calories-v13.html`
**Auth:** Supabase OAuth (Google sign-in)
**Database:** Supabase Postgres with RLS
**App:** ChatGPT-native (reads write to agent)

### Canonical Flow
```
User ↔ ChatGPT (agent decides action)
         ↓
      MCP Tools (safety + validation)
         ↓
      Supabase (persistence + RLS)
         ↓
      Widget (read-only dashboard)
```

---

## ⏳ Final Task: Sentry Integration

### What's Needed
1. Create Sentry project
2. Add `SENTRY_DSN` to Vercel env
3. Wrap MCP handler in `Sentry.captureException()`
4. Add to `api/mcp.ts`

### Code Template
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 0.1,
  integrations: [new Sentry.Integrations.Http({ tracing: true })]
});

// In handleMcp():
try {
  // ... existing logic
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      tool: method,
      userId: ctx?.userId || "unknown",
      source: ctx?.source || "mcp"
    }
  });
  throw error;
}
```

### Expected Outcome
- All unhandled exceptions sent to Sentry dashboard
- Widget version + tool name + user context visible in errors
- Error alerts configured for production
- ~5 minutes to complete

---

## 📋 Uncommitted Changes

```
Untracked files:
  .agents/ORCHESTRATOR.md          (6500+ lines, complete shipping plan)
  V2_UI_PLAN.md                    (160 lines, original requirements)
  artifacts/                        (supporting docs)
```

### Ready to Commit?
```bash
git add .agents/ORCHESTRATOR.md .agents/STATUS.md
git commit -m "Orchestrator: Add complete 7-phase shipping plan and status report"
git push origin main
```

---

## 🎯 Success Criteria (7/8 Met)

| Criterion | Status |
|-----------|--------|
| Phase 0: CI/CD passes | ✅ |
| Phase 1: Agent tools ship | ✅ |
| Phase 2: Memory persists across conversations | ✅ |
| Phase 3: Real user auth | ✅ |
| Phase 4: Onboarding UX | ✅ |
| Phase 5: Widget polish + trust feedback | ✅ |
| Phase 6: Instrumentation + retention | ✅ |
| Phase 7: Cleanup + hardening | ✅ (minus Sentry) |
| **Overall:** Production-ready ChatGPT app | **87.5%** |

---

## 🔄 Next Steps (Post-Sentry)

1. **Add Sentry** (30 min)
   - Setup project
   - Add DSN to Vercel
   - Wire into MCP handler
   - Test with manual error throw

2. **Launch Metrics Dashboard**
   - Create Supabase views for funnel
   - Share dashboard link with team
   - Set up weekly SQL report

3. **Controlled Beta Expansion**
   - Invite 10-20 alpha testers
   - Measure funnel for 1 week
   - Gather feedback on agent responses

4. **Product Iteration**
   - Improve onboarding based on drop-off
   - Enhance pattern detection
   - Add meal estimation improvements

---

**Status as of 2026-03-13 11:15 UTC**

All core infrastructure shipped. Product is live in ChatGPT and measuring users. Ready for Sentry + metrics dashboard, then beta expansion.

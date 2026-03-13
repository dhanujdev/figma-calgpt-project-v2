# CalGPT Shipping Plan

## Delivery Notes

- 2026-03-12: Phase 0 completed locally. `npm run test:unit` passed with 56 tests and `npm run test:strict` passed.
- 2026-03-12: Phase 2 started with schema + note tool work.
- 2026-03-12: Phase 1 read-only additions continued with `get_recent_meals` and `get_meal_suggestions`.
- 2026-03-12: Phase 1 write/check-in work continued with `estimation_notes` support and pattern-based daily check-ins.
- 2026-03-12: Phase 5 proactive coaching shipped with shared pattern detection, richer weekly reviews, goal projection, plateau detection, and streak milestone badges.
- 2026-03-13: Agent-only writes shipped in `chatgpt.com`. Widget is now read-only and users must ask the agent in chat to log meals, delete meals, log weight, and update goals/preferences.
- 2026-03-13: Live ChatGPT testing showed the next success bottleneck is product clarity and polish, not more tools. Near-term priority order is onboarding, response quality, empty/error states, premium widget polish, trust feedback, and instrumentation.
- 2026-03-13: Phase 4 started. `sync_state` and `get_user_profile` now emit onboarding guidance, the widget ships stronger empty/error states, and the beta prompt cookbook/checklists are in place.
- 2026-03-13: Phase 5 trust feedback started. The MCP gateway now emits widget-friendly `actionSummary` payloads for write actions, the widget renders a clear "Last update" confirmation card, and live `@GPT-Calories V2` testing confirmed the in-chat weight logging flow shows the new confirmation state.
- 2026-03-13: Phase 5 response consistency and Phase 6 instrumentation started. Write paths now return clearer saved-change messages, the gateway exposes widget-version failure telemetry, and backend funnel events are recorded for dashboard open, meal log, weight log, daily check-in, and weekly review.
- 2026-03-13: Phase 5 visual polish continued. The widget hierarchy, typography, settings summaries, and check-in/review scan paths were refreshed for faster in-chat reading, and the cache-busted widget URI moved to `ui://widget/gpt-calories-v12.html`.
- 2026-03-13: Phase 6 reporting started. Supabase now exposes beta metrics views for funnel summary, retention, prompt drop-off, and empty-state recovery, and the analytics docs now define the exact weekly SQL checks.
- 2026-03-13: Phase 3 closed. Production OAuth is live with Supabase Google sign-in, unauthenticated MCP calls return OAuth challenge metadata, and `@GPT-Calories V2` works in regular `chatgpt.com` chats with authenticated tool calls.
- 2026-03-13: Widget navigation regression fixed in live ChatGPT by redeploying production and recreating the ChatGPT draft app so it rediscovers `ui://widget/gpt-calories-v13.html`. Home, Progress, and Settings now switch correctly in fresh `chatgpt.com` responses.
- 2026-03-13: Phase 7 started. The unused React/shadcn surface was removed, runtime dependencies dropped to 6, and strict tests plus live OAuth smoke still passed after the cleanup batch.
- 2026-03-13: Phase 7 hardening continued. The Supabase edge runtime now emits structured JSON logs for requests, unknown methods, MCP failures, and analytics write failures, and `tests/unit/logging.test.ts` verifies the log payloads are parseable.
- 2026-03-13: Phase 7 hardening continued with shared write rate limiting. Mutating tools now share a 3-writes-in-10-seconds cap backed by `analytics_events`, MCP failures return `failureClass: "rate_limited"` with `retryAfterSeconds`, and direct REST write routes map that failure to HTTP 429.
- 2026-03-13: Phase 7 monitoring continued with a scheduled GitHub Actions production smoke. `.github/workflows/health-check.yml` now runs the OAuth MCP smoke against production every 30 minutes and on manual dispatch.

## Current Phase Status

| Phase | Status | Notes |
|------|--------|------|
| 0. CI/CD Foundation | Done | Local/unit/CI safety net shipped |
| 1. Agent Intelligence | Done | Tool surface, estimation notes, richer check-ins, and widget support shipped |
| 2. Agent Memory | Done | `agent_notes` schema and tools shipped |
| 3. Auth & Real Users | Done | Supabase Google OAuth works in ChatGPT |
| 4. Beta UX & Onboarding | Done | Onboarding guidance, empty states, and prompt cookbook shipped |
| 5. Read-Only Widget Polish & Trust | Done | Agent-only writes, trust feedback, and polished read-only widget shipped |
| 6. Instrumentation & Retention | Done | Event capture, reporting views, and beta SQL analysis shipped |
| 7. Strip Dead Weight & Harden | In Progress | Cleanup, structured logging, rate limiting, and scheduled production smoke shipped; Sentry and bundle-size target remain |

## Product Alignment Update

- Controlled beta is viable now. Broad public growth is not.
- The canonical UX is: user asks in chat, agent performs writes, widget confirms and displays state.
- Do not add more MCP tools until the beta UX work below is complete.
- Success metrics for the next milestone are:
  - first dashboard open
  - first logged meal
  - first logged weight
  - first daily check-in
  - first weekly review
  - 7-day retention

## Execution Methodology

### Branch Strategy

```
main (production — auto-deploys to Vercel)
 └── phase/1-agent-intelligence
      ├── feat/rich-tool-descriptions
      ├── feat/user-profile-tool
      ├── feat/meal-estimation
      └── ...
```

- Every feature gets its own branch off the phase branch
- Phase branch merges to main only when ALL tasks pass the gate
- Never push directly to main

### PR Gate (Every Pull Request)

```bash
# Automated — runs in GitHub Actions
npm run check:mcp-contract    # Tool definitions intact
npm run check:widget-contract  # Widget bridge tokens intact
npm run check:sql-migration    # Schema migration valid
npm run check:ui-shell         # Dev harness intact
npm run test:unit              # Vitest unit tests
npm run build                  # Vite build succeeds
npm run smoke:mcp              # Live endpoint responds (on preview URL)
```

Every PR gets a Vercel preview URL. Smoke tests run against the preview, not production.

### Deploy Sequence

1. PR passes gate → merge to phase branch
2. Phase branch: run full test suite → merge to main
3. Vercel auto-deploys main to production
4. Post-deploy: `npm run smoke:mcp` against production URL
5. If smoke fails: revert merge immediately (Vercel instant rollback)

### Change Classification

| Type | Risk | Gate |
|------|------|------|
| Tool description text | Low | Contract check only |
| New tool (additive) | Medium | Unit test + contract + smoke |
| Tool behavior change | High | Unit + integration + smoke + manual verify |
| Schema migration | Critical | Migration check + backup + staged rollout |
| Widget HTML change | Medium | Widget contract + manual visual check |
| Dependency change | Low | Build + contract checks |

---

## Phase 0: CI/CD Foundation

> Ship the safety net before shipping features.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 0.1 | Add Vitest config | `vitest.config.ts` | Vitest runs with zero tests |
| 0.2 | Unit tests for validation helpers | `tests/unit/validation.test.ts` | All helpers return correct values |
| 0.3 | Unit tests for date functions | `tests/unit/dates.test.ts` | normalizeDate, isoDateInTimeZone, addDaysToIsoDate edge cases |
| 0.4 | MCP handler mock tests | `tests/unit/handlers.test.ts` | Each handler returns expected shape with mocked Supabase |
| 0.5 | GitHub Actions workflow | `.github/workflows/ci.yml` | Pipeline runs on PR, blocks merge on failure |
| 0.6 | Add `test:unit` script | `package.json` | `vitest run` passes |
| 0.7 | Vercel preview integration | `.github/workflows/ci.yml` | Preview URL posted as PR comment |

### Test Scenarios

```
validation.test.ts
├── clampPositive
│   ├── returns fallback for NaN input
│   ├── returns fallback for negative input
│   ├── clamps to max
│   ├── passes through valid values
│   └── handles string-number coercion
├── sanitizeText
│   ├── strips < > " ' & characters
│   ├── truncates to maxLen
│   ├── handles null/undefined input
│   └── preserves clean text
├── isValidIsoDate
│   ├── accepts YYYY-MM-DD
│   ├── rejects YYYY-M-D
│   ├── rejects ISO timestamp
│   └── rejects empty string
├── UUID_RE
│   ├── matches valid UUID
│   ├── rejects partial UUID
│   └── rejects SQL injection string "x,user_id.neq.foo"
└── LEGACY_ID_RE
    ├── matches meal_123456_abc123
    └── rejects arbitrary strings

dates.test.ts
├── normalizeDate
│   ├── returns today for empty input
│   ├── passes through valid YYYY-MM-DD
│   ├── converts Date string to ISO date
│   └── returns today for garbage input
├── addDaysToIsoDate
│   ├── adds positive days
│   ├── subtracts days (negative)
│   └── handles month/year boundaries
└── resolveTimeZone
    ├── returns valid timezone as-is
    ├── falls back for invalid timezone
    └── uses default for empty input

handlers.test.ts (mocked Supabase)
├── logMeal
│   ├── rejects empty name
│   ├── clamps negative calories to 0
│   ├── sanitizes meal name (strips HTML)
│   ├── returns success with state shape
│   └── calls recalcDailyTotals after insert
├── deleteMeal
│   ├── rejects empty meal_id
│   ├── rejects SQL injection meal_id
│   ├── accepts valid UUID meal_id
│   ├── accepts valid legacy meal_id
│   └── returns success with updated state
├── updateGoals
│   ├── clamps calories to valid range
│   ├── preserves existing values for null params
│   └── returns success with state
├── logWeight
│   ├── rejects zero weight
│   ├── rejects negative weight
│   ├── clamps to max 1000
│   └── returns progress shape
├── updatePreferences
│   ├── sanitizes language field
│   ├── clamps height_cm
│   └── returns preferences shape
├── syncState
│   ├── returns state + progress + mode
│   └── defaults range to 90D
├── getProgress
│   └── returns progress shape with expected keys
├── runDailyCheckin
│   ├── returns recommendations array
│   └── includes calorie/protein/streak
├── runWeeklyReview
│   ├── returns insights array
│   ├── includes consumedAverage (number)
│   ├── includes calorieGoal (number, not burned)
│   └── does NOT include burnedAverage
└── suggestGoalAdjustments
    ├── returns currentGoals + proposedGoals
    └── proposedGoals has valid calorie range
```

### Exit Criteria

- [x] `npm run test:unit` runs 40+ tests, all green
- [x] GitHub Actions runs on PR, blocks merge on failure
- [x] Vercel preview deploys on every PR

---

## Phase 1: Agent Intelligence

> Make ChatGPT a smarter nutritionist through better tools.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 1.1 | Rewrite tool descriptions | `api/mcp.ts` | Contract check passes, descriptions include coaching guidance |
| 1.2 | Add output templates | `api/mcp.ts` | Each tool has `_meta.openai/outputTemplate` |
| 1.3 | New: `get_user_profile` tool | `mcp_handler.tsx`, `api/mcp.ts` | Unit test: returns goals+prefs+trends+notes in one call |
| 1.4 | New: `get_recent_meals` tool | `mcp_handler.tsx`, `api/mcp.ts` | Unit test: returns last N unique meals across dates |
| 1.5 | New: `get_meal_suggestions` tool | `mcp_handler.tsx`, `api/mcp.ts` | Unit test: returns suggestions based on remaining macros |
| 1.6 | Add `estimation_notes` to log_meal | `mcp_handler.tsx`, schema migration | Unit test: notes stored and returned in sync_state |
| 1.7 | Enrich daily checkin | `mcp_handler.tsx` | Unit test: returns pattern-based observations |
| 1.8 | Update widget for new data | `component.html` | Widget contract passes, estimation notes shown on meals |

### Test Scenarios

```
tool-descriptions.test.ts
├── every tool has description > 50 chars
├── every tool description mentions when to use it
├── log_meal description mentions estimation
├── sync_state description mentions "start of conversation"
└── run_daily_checkin description mentions "end of day"

get-user-profile.test.ts
├── returns goals shape
├── returns preferences shape
├── returns streak count
├── returns recent meal count
├── returns BMI
├── returns agent notes (empty array if none)
└── handles brand-new user (defaults)

get-recent-meals.test.ts
├── returns unique meals by name
├── respects limit parameter (default 20)
├── orders by frequency then recency
├── includes avg calories per meal name
└── returns empty array for new user

get-meal-suggestions.test.ts
├── suggests high-protein when protein is low
├── suggests low-calorie when near goal
├── respects user preferences (vegetarian note)
├── returns empty when goals are met
└── handles zero goals gracefully

log-meal-estimation.test.ts
├── stores estimation_notes field
├── returns notes in meal object
├── handles null notes (backward compatible)
└── sanitizes notes text

enriched-checkin.test.ts
├── detects protein-under pattern (4+ days below 70%)
├── detects skipped-meal pattern
├── detects over-eating trend
├── returns generic advice when no patterns found
└── includes streak context in recommendations
```

### Execution Sequence

1. **1.1 + 1.2** first — zero-risk text changes, immediate improvement
2. **1.6** next — schema migration (needs backup before deploy)
3. **1.3** then — read-only tool, additive
4. **1.4 + 1.5** — read-only tools, additive
5. **1.7** — behavior change to existing tool, needs careful test
6. **1.8** — widget update, visual verification needed

### Schema Migration (1.6)

```sql
-- Add estimation_notes to meals table
ALTER TABLE meals ADD COLUMN IF NOT EXISTS estimation_notes TEXT;
```

**Deploy sequence:**
1. Run migration on Supabase (additive, non-breaking)
2. Deploy handler code that writes the field
3. Deploy widget that displays the field
4. Verify: old meals still render (null notes = no display)

### Exit Criteria

- [x] All 11+ tools have coaching-grade descriptions
- [x] `get_user_profile` returns full context in one call
- [x] `get_recent_meals` returns deduplicated meal history
- [x] `get_meal_suggestions` returns macro-aware suggestions
- [x] `estimation_notes` stored and displayed
- [x] Checkin returns pattern-based observations
- [x] Contract checks pass
- [x] 20+ new unit tests pass
- [x] Manual test: start ChatGPT conversation, agent uses profile tool, estimates a meal, checks in

---

## Phase 2: Agent Memory

> ChatGPT remembers the user across conversations.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 2.1 | Schema: `agent_notes` table | `supabase/migrations/` | Migration check passes, RLS enabled |
| 2.2 | New: `save_agent_note` tool | `mcp_handler.tsx`, `api/mcp.ts` | Unit test: upserts note by key |
| 2.3 | New: `get_agent_notes` tool | `mcp_handler.tsx`, `api/mcp.ts` | Unit test: returns all notes for user |
| 2.4 | New: `delete_agent_note` tool | `mcp_handler.tsx`, `api/mcp.ts` | Unit test: removes note by key |
| 2.5 | Include notes in `get_user_profile` | `mcp_handler.tsx` | Unit test: profile includes notes array |
| 2.6 | Include notes in `sync_state` | `mcp_handler.tsx` | Unit test: sync returns notes in state |
| 2.7 | Tool descriptions guide memory use | `api/mcp.ts` | Description tells ChatGPT to save dietary restrictions, allergies, preferences |

Note: `get_user_profile` has been added in the current branch to unblock note integration work.

### Schema Migration (2.1)

```sql
CREATE TABLE IF NOT EXISTS agent_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  note_key TEXT NOT NULL,
  note_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, note_key)
);

ALTER TABLE agent_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notes"
  ON agent_notes FOR ALL
  USING (auth.uid() = user_id);
```

### Test Scenarios

```
save-agent-note.test.ts
├── creates new note
├── updates existing note (upsert by key)
├── sanitizes note_key (max 100 chars, no special chars)
├── sanitizes note_value (max 2000 chars)
├── rejects empty key
├── rejects empty value
└── returns saved note

get-agent-notes.test.ts
├── returns all notes for user
├── returns empty array for new user
├── does not leak other users' notes
└── orders by updated_at descending

delete-agent-note.test.ts
├── deletes by key
├── returns success even if key not found
└── validates key format

sync-state-with-notes.test.ts
├── sync_state includes agentNotes array
├── backward compatible (old clients ignore field)
└── notes are sorted by key

memory-integration.test.ts (E2E scenario)
├── save note "diet:vegetarian" → get notes → includes it
├── save note "allergy:peanuts" → get profile → includes it
├── update note "diet:vegan" → get notes → value updated
├── delete note "diet" → get notes → removed
└── notes survive across tool calls (persistence)
```

### Tool Description Guidance

The `save_agent_note` description should tell ChatGPT:
> Save a persistent observation about the user. Use this when you learn something that should be remembered across conversations: dietary restrictions, allergies, food preferences, lifestyle patterns, medical conditions mentioned, exercise habits. Key format: category:detail (e.g., "allergy:shellfish", "preference:high-protein", "lifestyle:intermittent-fasting"). Do NOT store conversation summaries or temporary info.

### Exit Criteria

- [x] `agent_notes` table deployed with RLS
- [x] save/get/delete tools work end-to-end
- [x] `sync_state` and `get_user_profile` include notes
- [x] Contract checks pass with new tools
- [x] 15+ new unit tests pass
- [x] Manual test: tell ChatGPT "I'm vegetarian and allergic to peanuts" → it saves notes → new conversation → ChatGPT references them

---

## Phase 3: Auth & Real Users

> Real users with isolated, persistent data.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 3.1 | Enable OAuth mode | `api/mcp.ts`, env vars | Smoke test: `/mcp` returns oauth security scheme |
| 3.2 | Configure ChatGPT app OAuth | ChatGPT developer console | Manual: OAuth flow completes in ChatGPT |
| 3.3 | Set ALLOW_DEMO_MODE=false | Vercel + Supabase env | Smoke test: unauthenticated call returns authRequired |
| 3.4 | Onboarding detection | `mcp_handler.tsx` | Unit test: `get_user_profile` returns `isNewUser: true` when no goals set |
| 3.5 | Onboarding tool description | `api/mcp.ts` | Description tells ChatGPT to run onboarding for new users |
| 3.6 | Keep demo mode for dev | Local env only | Dev harness still works without OAuth |

### Test Scenarios

```
auth.test.ts
├── valid bearer token → resolves real user ID
├── invalid bearer token → returns authRequired (not demo)
├── missing bearer token → returns authRequired (not demo)
├── demo mode env=true → falls back to demo user
└── demo mode env=false → rejects unauthenticated

onboarding.test.ts
├── new user profile has isNewUser=true
├── user with goals set has isNewUser=false
├── sync_state for new user includes onboarding hint
└── after update_goals, isNewUser becomes false

oauth-flow.test.ts (manual checklist)
├── ChatGPT shows "Sign in" button
├── OAuth redirects to Supabase login
├── After login, token forwarded to MCP tools
├── Tool calls succeed with real user ID
├── Second conversation reuses auth (no re-login)
└── Revoke access → tool calls return authRequired
```

### Deploy Sequence (Critical — affects all users)

1. **Staging first**: Deploy OAuth changes to Vercel preview branch
2. **Test OAuth flow** manually in ChatGPT with preview URL
3. **Canary**: Enable OAuth on production but keep `ALLOW_DEMO_MODE=true`
4. **Verify**: Real users can authenticate AND demo still works
5. **Flip**: Set `ALLOW_DEMO_MODE=false` on production
6. **Monitor**: Watch Vercel logs for auth failures for 24h
7. **Rollback plan**: Flip `ALLOW_DEMO_MODE=true` if auth breaks

### Exit Criteria

- [x] OAuth flow works end-to-end in ChatGPT
- [x] Unauthenticated requests rejected in production
- [x] New users detected, ChatGPT initiates onboarding
- [x] Demo mode still works locally for development
- [x] No existing functionality broken
- [x] Smoke test passes against production

---

## Phase 4: Beta UX & Onboarding

> Teach the user how to use the app and make the first successful action obvious.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 4.1 | First-turn onboarding guidance | ChatGPT app instructions, `api/mcp.ts` | Manual: first response teaches 4-5 concrete prompts |
| 4.2 | New-user prompt flow | `mcp_handler.tsx`, `api/mcp.ts` | Manual: brand-new user gets onboarding instead of sparse stats |
| 4.3 | Widget empty states | `public/component.html` | Visual: empty dashboard/progress/settings tell user what to ask next |
| 4.4 | Widget error recovery copy | `public/component.html` | Visual: user gets retry guidance, not raw confusion |
| 4.5 | Reduce duplicate tool narration | ChatGPT app instructions | Manual: responses stop repeating the same action twice |
| 4.6 | Beta prompt cookbook | `docs/` | Checklist exists for “log meal”, “log weight”, “show dashboard”, “daily check-in”, “weekly review” |

### Test Scenarios

```
chatgpt-onboarding.md (manual)
├── first conversation teaches example prompts
├── examples cover dashboard, meal logging, weight logging, check-in, review
├── new user with no data gets onboarding guidance
├── existing user gets direct action instead of onboarding
└── responses do not repeat the same tool action narration twice

widget-empty-states.md (manual)
├── empty dashboard says how to log a first meal
├── empty progress says how to log a first weight
├── empty settings says how to update goals/preferences in chat
├── error state shows retry path
└── refresh action remains available
```

### Exit Criteria

- [x] First-turn experience teaches the agent-only interaction model clearly
- [x] New users are guided into a successful first action within one turn
- [x] Empty and sparse states tell the user what to do next
- [ ] ChatGPT responses are concise and non-repetitive
- [x] Manual test in `chatgpt.com`: a cold-start user can succeed without guessing commands

---

## Phase 5: Read-Only Widget Polish & Trust

> Make the widget feel premium, legible, and trustworthy without reintroducing in-widget writes.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 5.1 | Visual hierarchy refresh | `public/component.html` | Visual: typography, spacing, and emphasis feel intentional |
| 5.2 | Better success feedback | `public/component.html`, ChatGPT app instructions | Manual: after writes, widget and response make the change obvious |
| 5.3 | Read-only settings polish | `public/component.html` | Visual: settings page reads cleanly without looking “disabled” |
| 5.4 | Stronger check-in/review cards | `public/component.html` | Visual: insights, patterns, and action items scan quickly |
| 5.5 | Mobile iframe polish | `public/component.html` | Visual: all pages work at 375px width |
| 5.6 | Before/after trust copy | ChatGPT app instructions | Manual: responses call out what changed after log/delete/update actions |

### Test Scenarios

```
widget-polish.md (manual)
├── home page feels readable and not cramped
├── progress page emphasizes current weight and trends clearly
├── settings page reads as a summary, not a broken form
├── daily check-in scans in under 5 seconds
├── weekly review scans in under 10 seconds
└── mobile iframe keeps all actions and copy visible

trust-feedback.md (manual)
├── log meal response names the meal and new totals
├── delete meal response names the deleted meal and updated totals
├── log weight response names the saved weight and visible trend page
├── dashboard widget reinforces the updated state
└── no stale interactive controls appear in the widget
```

### Exit Criteria

- [x] Widget remains fully read-only
- [x] Home, Progress, Settings, Check-in, and Review all feel production-grade
- [x] Users can tell what changed after every write action
- [x] Mobile and desktop ChatGPT iframe layouts are clean
- [x] Manual test in `chatgpt.com`: no confusion between agent actions and widget display

---

## Phase 6: Instrumentation & Retention

> Measure whether the product is actually becoming habit-forming.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 6.1 | Funnel event tracking | `api/mcp.ts`, `mcp_handler.tsx` | Verify events for first dashboard open, first meal, first weight, first check-in, first review |
| 6.2 | Error/version telemetry | `api/mcp.ts`, `public/component.html` | Logs include tool name, widget version, and failure class |
| 6.3 | Beta cohort dashboard | analytics destination, docs | Manual: core weekly funnel visible in one place |
| 6.4 | Retention metrics | analytics destination, docs | Manual: day-1 and day-7 retention measurable |
| 6.5 | Prompt drop-off analysis | analytics destination, docs | Manual: identify where users abandon after onboarding |
| 6.6 | Weekly review adoption metric | analytics destination | Manual: review usage rate visible by cohort |
| 6.7 | Empty-state recovery metric | analytics destination | Manual: measure how often empty users convert to first action |

### Test Scenarios

```
instrumentation.md (manual)
├── dashboard_open event fires
├── meal_logged event fires
├── weight_logged event fires
├── daily_checkin_run event fires
├── weekly_review_run event fires
├── widget_render_failed includes widget version
└── tool_error includes tool name and class

beta-metrics.md (manual)
├── first dashboard open count visible
├── first meal conversion visible
├── first weight conversion visible
├── first check-in conversion visible
├── first review conversion visible
├── day-1 retention visible
└── day-7 retention visible
```

### Exit Criteria

- [x] Product funnel is measurable end-to-end
- [x] Widget/template version is visible in error telemetry
- [x] Team can identify the highest drop-off step without log-diving
- [x] Day-1 and Day-7 retention can be tracked for beta users
- [x] Next iteration decisions are based on measured user behavior

---

## Phase 7: Strip Dead Weight & Harden

> Remove unused files, add monitoring, and harden the production path.

### Tasks

| # | Task | File(s) | Test |
|---|------|---------|------|
| 7.1 | Delete src/app/components/ui/ | 65+ files | Build still passes |
| 7.2 | Delete unused src/ components | ChatInterface.tsx, HealthRing.tsx, MealLog.tsx | Build passes |
| 7.3 | Simplify App.tsx to minimal harness | `src/app/App.tsx` | UI shell check passes |
| 7.4 | Remove all Radix/shadcn deps | `package.json` | Build passes, `npm ls` clean |
| 7.5 | Remove recharts, react-day-picker, etc | `package.json` | Build passes |
| 7.6 | Add Sentry to Vercel functions | `api/mcp.ts` | Errors appear in Sentry dashboard |
| 7.7 | Structured JSON logging | `mcp_handler.tsx` | Logs are parseable JSON |
| 7.8 | Health check cron | GitHub Actions scheduled workflow | Alerts on Slack/email if MCP endpoint down |
| 7.9 | Rate limiting on write tools | `mcp_handler.tsx` | Unit test: 4th write in 10s returns rate_limited |

### Test Scenarios

```
cleanup-safety.test.ts
├── npm run build passes after deletion
├── npm run check:mcp-contract passes
├── npm run check:widget-contract passes
├── npm run check:ui-shell passes (or updated)
├── npm run check:sql-migration passes
├── npm run test:unit passes
└── npm run smoke:mcp passes

rate-limiting.test.ts
├── first write succeeds
├── second write succeeds
├── third write succeeds
├── fourth write within 10s returns rate_limited error
├── write after cooldown succeeds
├── read tools are not rate limited
└── different users have independent limits

sentry.test.ts (manual verification)
├── throw error in tool handler → appears in Sentry
├── error includes user_id (anonymized)
├── error includes tool name
├── error includes request timestamp
└── source maps resolve correctly
```

### Deletion Safety Protocol

1. Run full test suite BEFORE any deletion
2. Delete one category at a time (shadcn → unused components → deps)
3. Run full test suite AFTER each deletion batch
4. If any test fails, revert that batch and investigate
5. Commit each successful batch separately (easy rollback)

### Exit Criteria

- [ ] src/app/components/ui/ deleted (65+ files)
- [x] package.json has <15 runtime dependencies (down from 40+)
- [ ] Build output < 50KB (down from 176KB)
- [ ] Sentry receiving errors
- [x] JSON logs in Supabase function
- [x] Rate limiting on write tools
- [x] All existing tests still pass
- [x] Smoke test passes against production

---

## Testing Infrastructure Summary

| Layer | Tool | What It Tests | When It Runs |
|-------|------|--------------|--------------|
| **Unit** | Vitest | Validation, dates, handler logic | Every PR |
| **Contract** | Custom scripts | MCP tools, widget tokens, schema | Every PR |
| **Build** | Vite | TypeScript compiles, assets bundle | Every PR |
| **Smoke** | Custom script | Live endpoints respond correctly | Post-deploy |
| **Prompt UX** | Manual checklist | Onboarding clarity, prompt success, response quality | Beta UX phases |
| **Visual** | Manual checklist | Widget renders correctly in ChatGPT | Per widget PR |
| **Auth** | Manual checklist | OAuth flow works end-to-end | Phase 3 only |
| **Analytics** | Manual checklist | Funnel and retention metrics land correctly | Phase 6 only |
| **Load** | Manual | Rate limiting triggers correctly | Phase 7 only |

### Test File Structure

```
tests/
├── unit/
│   ├── validation.test.ts      (Phase 0)
│   ├── dates.test.ts           (Phase 0)
│   ├── handlers.test.ts        (Phase 0)
│   ├── user-profile.test.ts    (Phase 1)
│   ├── recent-meals.test.ts    (Phase 1)
│   ├── meal-suggestions.test.ts (Phase 1)
│   ├── estimation.test.ts      (Phase 1)
│   ├── checkin-patterns.test.ts (Phase 1)
│   ├── agent-notes.test.ts     (Phase 2)
│   ├── auth.test.ts            (Phase 3)
│   ├── onboarding.test.ts      (Phase 3)
│   ├── patterns.test.ts        (Phase 5 shipped milestone)
│   ├── logging.test.ts         (Phase 7)
│   └── rate-limiting.test.ts   (Phase 7)
├── helpers/
│   └── mock-supabase.ts        (Shared mock)
└── checklists/
    ├── chatgpt-onboarding.md   (Phase 4)
    ├── widget-empty-states.md  (Phase 4)
    ├── widget-polish.md        (Phase 5)
    ├── trust-feedback.md       (Phase 5)
    ├── instrumentation.md      (Phase 6)
    ├── beta-metrics.md         (Phase 6)
    ├── oauth-flow.md           (Phase 3)
    └── sentry-verify.md        (Phase 7)
```

### Mock Strategy

Tool handler tests mock the Supabase client:

```typescript
// tests/helpers/mock-supabase.ts
// Returns a fake client where .from().select().eq() etc.
// return configurable data or errors.
// Tracks all calls for assertion.
```

This avoids needing a live database for unit tests while still verifying handler logic.

---

## Rollback Procedures

| Scenario | Action |
|----------|--------|
| Smoke test fails after deploy | Vercel dashboard → Deployments → Promote previous |
| Schema migration breaks queries | Supabase dashboard → SQL Editor → Run rollback SQL |
| OAuth breaks all users | Flip `ALLOW_DEMO_MODE=true` in Vercel env vars → redeploy |
| Widget renders broken in ChatGPT | Revert `component.html` commit → push to main |
| Rate limiter too aggressive | Increase threshold or disable via env var |

Every schema migration must have a documented rollback SQL statement in a comment block at the top of the migration file.

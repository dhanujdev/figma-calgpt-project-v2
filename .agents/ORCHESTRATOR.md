# CalGPT Project Orchestrator

This file defines the master execution plan for shipping CalGPT as a ChatGPT-native AI nutrition coach. The orchestrator coordinates specialized agents across 6 phases, each with distinct responsibilities and success criteria.

## Architecture

```
Orchestrator (this file)
├── Agent: Phase-0-CI-Setup
├── Agent: Phase-1-Agent-Intelligence
├── Agent: Phase-2-Agent-Memory
├── Agent: Phase-3-Auth-RealUsers
├── Agent: Phase-4-Widget-Polish
├── Agent: Phase-5-Proactive-Coaching
└── Agent: Phase-6-Cleanup-Hardening
```

Each agent:
- Works on its phase branch (`phase/N-name`)
- Executes all tasks in sequence
- Runs full test gate before merging
- Reports status back to orchestrator

---

## Phase 0: CI/CD Foundation

**Agent:** `phase-0-ci-setup`
**Branch:** `phase/0-ci-setup`
**Duration:** 4-6 hours
**Risk Level:** None (foundational, no user impact)

### Tasks

1. **Setup Vitest**
   - Create `vitest.config.ts`
   - Add `npm run test:unit` script
   - Install `vitest`, `@vitest/ui`, `@testing-library/react`
   - Commit: "Setup Vitest with base config"

2. **Write Phase 0 Unit Tests** (40 tests across 3 files)
   - `tests/unit/validation.test.ts` (15 tests)
     - `clampPositive`: NaN, negative, max, valid, coercion
     - `sanitizeText`: XSS chars, truncation, null, clean
     - `isValidIsoDate`: valid, invalid, timestamp, empty
     - `UUID_RE`: valid UUID, partial, SQL injection
     - `LEGACY_ID_RE`: valid, invalid
   - `tests/unit/dates.test.ts` (12 tests)
     - `normalizeDate`: empty, valid, Date string, garbage
     - `addDaysToIsoDate`: forward, backward, boundaries
     - `resolveTimeZone`: valid, invalid, default
   - `tests/unit/handlers.test.ts` (13 tests)
     - Mock Supabase client
     - `logMeal`: empty name, clamp, sanitize, state shape, recalc
     - `deleteMeal`: empty ID, SQL injection, valid IDs
     - `updateGoals`: clamp, preserve, shape
     - `logWeight`: zero, negative, max
     - `updatePreferences`: sanitize, clamp
     - `syncState`: return shape
     - `getProgress`: shape
   - Commit: "Add validation, date, and handler unit tests"

3. **Create Mock Supabase Client**
   - File: `tests/helpers/mock-supabase.ts`
   - Mock `.from().select().eq().maybeSingle()` chains
   - Track call history for assertions
   - Allow configurable return data/errors
   - Commit: "Add Supabase mock helper"

4. **Setup GitHub Actions**
   - File: `.github/workflows/ci.yml`
   - Trigger: on PR to any branch
   - Steps:
     ```yaml
     - npm run check:mcp-contract
     - npm run check:widget-contract
     - npm run check:sql-migration
     - npm run check:ui-shell
     - npm run test:unit
     - npm run build
     - npm run smoke:mcp (on preview URL)
     ```
   - Block merge if any step fails
   - Post Vercel preview URL as comment
   - Commit: "Add GitHub Actions CI pipeline"

5. **Add Test Coverage Target**
   - `package.json` script: `test:coverage`
   - Vitest config: `coverage.branches: 85`, `coverage.lines: 85`
   - Commit: "Add coverage targets"

### Exit Criteria

- [ ] `npm run test:unit` runs 40+ tests, all green
- [ ] GitHub Actions workflow runs on PR creation
- [ ] Vercel preview deploys on PR
- [ ] Smoke test runs against preview URL
- [ ] All git history is clean, commits are atomic
- [ ] Phase 0 branch ready to merge to main

### Merge to Main

```bash
git checkout phase/0-ci-setup
npm run test:strict
# All pass? Then:
git checkout main
git pull origin main
git merge phase/0-ci-setup
git push origin main
```

---

## Phase 1: Agent Intelligence

**Agent:** `phase-1-agent-intelligence`
**Branch:** `phase/1-agent-intelligence`
**Duration:** 8-10 hours
**Risk Level:** Low (tool definitions, read-only tools, additive)

### Sub-Tasks

#### 1.1: Rewrite Tool Descriptions
- **File:** `api/mcp.ts`
- **Change:** Update all 11 tool descriptions in `MCP_TOOLS` array
- **Pattern:** Each description should include:
  - What the tool does (1 sentence)
  - When ChatGPT should use it (signal-based, e.g., "when user mentions skipping lunch")
  - What the output includes (coaching hint)
- **Example:**
  ```
  // Before:
  "description": "Log a meal with calories and macros."

  // After:
  "description": "Log a meal with calories, protein, carbs, and fats. ChatGPT estimates macros from the meal description if not provided by the user. Use this whenever the user mentions eating anything. Optionally include estimation_notes to explain your reasoning."
  ```
- **Test:** `npm run check:mcp-contract` passes (tool names unchanged)
- **Commit:** "Rewrite tool descriptions for coaching context"

#### 1.2: Add Output Templates
- **File:** `api/mcp.ts`
- **Change:** Add `_meta.openai/outputTemplate` to each tool definition
- **Template examples:**
  ```typescript
  log_meal: {
    outputTemplate: "Logged {{name}} ({{calories}} kcal, P{{protein}}g). Daily total: {{totalCalories}}/{{goals.calories}} kcal."
  },
  sync_state: {
    outputTemplate: "Updated state for {{date}}. Progress: {{totalCalories}}/{{goals.calories}} kcal, P{{totalProtein}}/{{goals.protein}}g."
  }
  ```
- **Test:** MCP contract still passes
- **Commit:** "Add output templates to guide ChatGPT responses"

#### 1.3: New Tool - get_user_profile
- **Files:** `supabase/functions/server/mcp_handler.tsx`, `api/mcp.ts`
- **Tool:** Read-only, returns full user context in one call
- **Response shape:**
  ```typescript
  {
    success: true,
    profile: {
      goals: { calories, protein, carbs, fats, goalWeight, startWeight, targetDate },
      preferences: { unitWeight, unitEnergy, language, reminderTime, themePreset, heightCm, streakBadgeNotifications },
      streak: { current: number },
      recentMeals: number,
      bmi: number,
      notes: string[], // agent-saved observations
      isNewUser: boolean
    }
  }
  ```
- **Handler logic:**
  - Call `ensureGoals()` + `ensurePreferences()` (cached)
  - Call `buildProgress()` for streak/BMI
  - Count unique meals in last 7 days
  - Fetch `agent_notes` (Phase 2 task, use empty array for now)
  - Return all together
- **Unit test:** `tests/unit/user-profile.test.ts` (8 tests)
  - Returns all fields for authenticated user
  - Sets `isNewUser=true` when goals are defaults
  - Sets `isNewUser=false` when goals customized
  - Counts meals correctly
  - Calculates BMI
  - Returns empty notes array (for Phase 2 compat)
  - Handles new user (no meals, no weights)
- **Test:** Run test suite, all green
- **Commit:** "Add get_user_profile tool"

#### 1.4: New Tool - get_recent_meals
- **Files:** `supabase/functions/server/mcp_handler.tsx`, `api/mcp.ts`
- **Tool:** Read-only, returns recently logged meals grouped by name
- **Parameters:** `{ limit?: number }` (default 20)
- **Response shape:**
  ```typescript
  {
    success: true,
    meals: [
      { name, calories, protein, carbs, fats, count, lastLogged, avgCalories },
      ...
    ]
  }
  ```
- **Handler logic:**
  - Fetch all meals for user, ordered by `consumed_at DESC`
  - Group by `meal_name` (case-insensitive)
  - For each group: calculate count, lastLogged, avgCalories
  - Sort by frequency DESC, then recency DESC
  - Return top N
- **Unit test:** `tests/unit/recent-meals.test.ts` (7 tests)
  - Returns deduplicated meals
  - Respects limit parameter
  - Orders by frequency then recency
  - Includes count and average calories
  - Handles new user (empty array)
- **Commit:** "Add get_recent_meals tool"

#### 1.5: New Tool - get_meal_suggestions
- **Files:** `supabase/functions/server/mcp_handler.tsx`, `api/mcp.ts`
- **Tool:** Read-only, suggests meals based on remaining macros for today
- **Parameters:** `{ date?: string }` (defaults to today)
- **Response shape:**
  ```typescript
  {
    success: true,
    suggestions: [
      { mealName, reason, estimatedCalories, estimatedProtein },
      ...
    ],
    remainingMacros: { calories, protein, carbs, fats }
  }
  ```
- **Handler logic:**
  - Get today's totals and goals
  - Calculate remaining macros
  - If protein < 70% of goal: suggest high-protein meals (chicken, tofu, fish)
  - If calories near goal: suggest low-calorie meals (salad, fruit)
  - If carbs high: suggest low-carb meals
  - If still room: suggest balanced meals
  - Pull from `recent_meals` + generic database
- **Unit test:** `tests/unit/meal-suggestions.test.ts` (6 tests)
  - Suggests high-protein when protein is low
  - Suggests low-calorie when near goal
  - Returns empty when goals met
  - Handles zero goals gracefully
- **Commit:** "Add get_meal_suggestions tool"

#### 1.6: Add estimation_notes to log_meal
- **Files:** `supabase/functions/server/mcp_handler.tsx`, schema migration, `api/mcp.ts`
- **Schema Migration:** `20260312_add_estimation_notes.sql`
  ```sql
  ALTER TABLE meals ADD COLUMN IF NOT EXISTS estimation_notes TEXT;
  ```
- **Handler change:** `logMeal()` accepts optional `estimation_notes` parameter
  ```typescript
  params: {
    name: string,
    calories: number,
    protein?: number,
    carbs?: number,
    fats?: number,
    estimation_notes?: string, // NEW
    date?: string
  }
  ```
- **Insert logic:** Store estimation_notes as-is (sanitized)
- **Response:** Include `estimationNotes` in meal object
- **Backward compat:** Old clients without estimation_notes still work
- **Unit test:** `tests/unit/estimation.test.ts` (5 tests)
  - Stores and returns estimation_notes
  - Handles null notes (backward compat)
  - Sanitizes notes text
- **Commit:** "Add estimation_notes to meals, schema migration"

#### 1.7: Enrich Daily Checkin with Patterns
- **Files:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** Enhance `runDailyCheckin()` to detect and report patterns
- **Pattern detection (logic in runDailyCheckin):**
  ```typescript
  // Check last 7 days of meals
  const weekData = await fetchWeekData(userId);

  // Pattern: protein deficit (< 70% goal for 4+ days)
  if (daysUnderProtein >= 4) {
    recommendations.push(`You've been under your protein goal 4 of 7 days (${daysUnderProtein}). Add high-protein snacks like Greek yogurt or nuts.`);
  }

  // Pattern: skipped meals (0 meals on any day)
  const missedDays = weekData.filter(d => d.meals === 0).length;
  if (missedDays > 0) {
    recommendations.push(`You didn't log any meals ${missedDays} day(s) this week. Logging helps track patterns.`);
  }

  // Pattern: over-eating (>110% goal for 3+ days)
  if (daysOverCalories >= 3) {
    recommendations.push(`You've exceeded your calorie goal ${daysOverCalories} days. Try smaller portions or more movement.`);
  }
  ```
- **Response:** Keep existing structure, just enrich recommendations
- **Unit test:** `tests/unit/checkin-patterns.test.ts` (8 tests)
  - Detects protein deficit
  - Detects skipped meals
  - Detects over-eating
  - Returns generic advice when no patterns
  - Includes streak context
- **Commit:** "Enrich daily checkin with pattern detection"

#### 1.8: Update Widget for New Data
- **File:** `public/component.html`
- **Changes:**
  - Display `estimationNotes` on meals (gray italics below macros)
  - Escapehtml() on notes
  - Widget contract still passes
- **Unit test:** Widget contract check passes
- **Manual test:** Log meal with estimation_notes, sync, verify notes display
- **Commit:** "Display estimation notes in widget"

### Test Sequence (Phase 1)

```bash
# Start on phase/1-agent-intelligence branch
git checkout -b phase/1-agent-intelligence origin/phase/0-ci-setup

# 1.1: Rewrite descriptions
# 1.2: Add templates
npm run check:mcp-contract # Should pass

# 1.3-1.5: New tools
npm run test:unit # Tests 1.3, 1.4, 1.5 pass

# 1.6: Schema migration
npm run check:sql-migration # Should pass

# 1.7: Enrich checkin
npm run test:unit # Tests 1.7 pass

# 1.8: Widget update
npm run check:widget-contract # Should pass

# Full gate
npm run test:strict
# If all pass:
git push origin phase/1-agent-intelligence
# Create PR, GitHub Actions runs, merges to main
```

### Exit Criteria

- [ ] All tool descriptions include coaching context
- [ ] All tools have output templates
- [ ] `get_user_profile` returns complete user context
- [ ] `get_recent_meals` returns deduplicated history
- [ ] `get_meal_suggestions` returns macro-aware suggestions
- [ ] `estimation_notes` stored and displayed
- [ ] Checkin returns pattern-based observations
- [ ] MCP contract check passes
- [ ] Widget contract check passes
- [ ] 40+ new unit tests pass
- [ ] Manual test in ChatGPT: agent uses profile tool, estimates meal, mentions patterns

---

## Phase 2: Agent Memory

**Agent:** `phase-2-agent-memory`
**Branch:** `phase/2-agent-memory`
**Duration:** 6-8 hours
**Risk Level:** Low (new table, additive, RLS-protected)

### Schema Migration

**File:** `supabase/migrations/20260312_add_agent_notes.sql`

```sql
-- Add agent_notes table for cross-conversation memory
CREATE TABLE IF NOT EXISTS agent_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  note_key TEXT NOT NULL,
  note_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, note_key)
);

-- Enable RLS
ALTER TABLE agent_notes ENABLE ROW LEVEL SECURITY;

-- Policy: users manage own notes
CREATE POLICY "users_manage_own_notes"
  ON agent_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX agent_notes_user_id_idx ON agent_notes(user_id);
```

### Tasks

#### 2.1: Deploy Schema Migration
- Verify migration in `supabase/migrations/`
- Test: `npm run check:sql-migration` passes
- Deploy to Supabase (Supabase dashboard or CLI)
- Verify table exists: `SELECT * FROM agent_notes LIMIT 1`
- Commit: "Add agent_notes schema migration"

#### 2.2: New Tool - save_agent_note
- **File:** `supabase/functions/server/mcp_handler.tsx`, `api/mcp.ts`
- **Tool:** Write, saves persistent observations
- **Parameters:**
  ```typescript
  {
    note_key: string,    // "diet:vegetarian", "allergy:peanuts", max 100 chars
    note_value: string   // "Vegetarian, avoids fish", max 2000 chars
  }
  ```
- **Handler logic:**
  - Validate key (alphanumeric + colon + dash, no spaces)
  - Sanitize value (max 2000, strip HTML)
  - Upsert into `agent_notes` table (unique on user_id + note_key)
  - Return saved note + all notes for user
- **Response:**
  ```typescript
  {
    success: true,
    savedNote: { key, value, updatedAt },
    allNotes: [...]
  }
  ```
- **Tool description:**
  > Save a persistent observation about the user that ChatGPT should remember across conversations. Examples: "diet:vegetarian", "allergy:peanuts", "preference:high-protein", "lifestyle:intermittent-fasting". Use when you learn something important about the user. ChatGPT will retrieve these notes at the start of every conversation.
- **Unit test:** `tests/unit/agent-notes.test.ts` (5 tests)
  - Creates new note
  - Updates existing note (upsert)
  - Validates key format
  - Sanitizes value
  - Rejects empty key/value
- **Commit:** "Add save_agent_note tool"

#### 2.3: New Tool - get_agent_notes
- **File:** `supabase/functions/server/mcp_handler.tsx`, `api/mcp.ts`
- **Tool:** Read-only, retrieves all saved notes
- **Parameters:** None
- **Response:**
  ```typescript
  {
    success: true,
    notes: [
      { key, value, updatedAt },
      ...
    ]
  }
  ```
- **Handler logic:**
  - Fetch all notes for user, order by key ASC
  - Return as array
  - Handle new user (empty array)
- **Tool description:**
  > Retrieve all persistent observations saved about this user in previous conversations. Use these to understand their dietary restrictions, allergies, food preferences, and lifestyle habits.
- **Unit test:** (part of agent-notes.test.ts)
  - Returns all notes
  - Returns empty array for new user
  - Does not leak other users' notes
- **Commit:** "Add get_agent_notes tool"

#### 2.4: New Tool - delete_agent_note
- **File:** `supabase/functions/server/mcp_handler.tsx`, `api/mcp.ts`
- **Tool:** Write, removes a note
- **Parameters:**
  ```typescript
  {
    note_key: string
  }
  ```
- **Handler logic:**
  - Delete by user_id + note_key
  - Return success (even if note didn't exist, for idempotency)
- **Response:**
  ```typescript
  {
    success: true,
    message: "Note deleted"
  }
  ```
- **Unit test:** (part of agent-notes.test.ts)
  - Deletes note
  - Succeeds even if note not found
- **Commit:** "Add delete_agent_note tool"

#### 2.5: Include Notes in get_user_profile
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** `get_user_profile` now fetches agent_notes and includes them
- **Response:**
  ```typescript
  {
    profile: {
      ...,
      notes: [{ key, value }, ...] // New field
    }
  }
  ```
- **Handler logic:**
  - After `buildProgress()`, fetch `agent_notes`
  - Include in profile object
  - Keep backward compat (old tools that don't use notes still work)
- **Unit test:** Tests updated to verify notes field included
- **Commit:** "Include agent notes in user profile"

#### 2.6: Include Notes in sync_state
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** `sync_state` now includes `agentNotes` in state object
- **Response:**
  ```typescript
  {
    success: true,
    state: {
      ...,
      agentNotes: [{ key, value }, ...] // New field
    },
    progress: {...}
  }
  ```
- **Backward compat:** Old clients ignore the field
- **Commit:** "Include agent notes in sync_state"

#### 2.7: Update Tool Descriptions
- **File:** `api/mcp.ts`
- **Change:** Tell ChatGPT when to save notes
- **New guidance in save_agent_note description:**
  > Use this tool when the user mentions any of these: dietary restrictions (vegetarian, vegan, kosher), allergies or intolerances, favorite/disliked foods, exercise habits, medical conditions, sleep patterns, or any other personal preference that should be remembered. Do NOT use this for conversation summaries or temporary information.
- **Commit:** "Update tool descriptions to guide note-saving"

### Test Sequence (Phase 2)

```bash
git checkout -b phase/2-agent-memory origin/phase/1-agent-intelligence

# Deploy schema migration (manual or via Supabase CLI)
npm run check:sql-migration # Passes

# Implement tools 2.2-2.4
npm run test:unit # Tests for save/get/delete pass

# Include notes in profile and sync_state
npm run test:unit # Updated tests pass

# Update descriptions
npm run check:mcp-contract # Passes

# Full gate
npm run test:strict
```

### Exit Criteria

- [ ] `agent_notes` table deployed with RLS
- [ ] save/get/delete tools work end-to-end
- [ ] `sync_state` and `get_user_profile` include notes
- [ ] All 15+ new unit tests pass
- [ ] Manual test: tell ChatGPT "I'm vegetarian" → it saves note → new conversation → ChatGPT retrieves it

---

## Phase 3: Auth & Real Users

**Agent:** `phase-3-auth-realusers`
**Branch:** `phase/3-auth-realusers`
**Duration:** 10-12 hours
**Risk Level:** High (breaks all unauthenticated access, requires careful rollout)

### Pre-Deploy Checklist

- [ ] OAuth configured in ChatGPT developer console
- [ ] Supabase OAuth provider configured (Google, Email, GitHub)
- [ ] Staging URL tested end-to-end
- [ ] Rollback plan documented (flip `ALLOW_DEMO_MODE=true`)

### Tasks

#### 3.1: Enable OAuth Mode in MCP Gateway
- **File:** `api/mcp.ts`
- **Change:** Update `initialize` response to include OAuth security scheme
- **Current:**
  ```typescript
  "tools": [...],
  "resources": [...]
  ```
- **New:**
  ```typescript
  "tools": [
    {
      "name": "log_meal",
      "description": "...",
      "security": [{ "oauth2": ["read", "write"] }]
    },
    ...
  ],
  "securitySchemes": {
    "oauth2": {
      "type": "oauth2",
      "flows": {
        "authorizationCode": {
          "authorizationUrl": "https://jpjxpyhuawgyrhbnnqyb.supabase.co/auth/v1/authorize",
          "tokenUrl": "https://jpjxpyhuawgyrhbnnqyb.supabase.co/auth/v1/token",
          "scopes": {
            "read": "Read user data",
            "write": "Write user data"
          }
        }
      }
    }
  }
  ```
- **Test:** `npm run check:mcp-contract` passes
- **Commit:** "Add OAuth security scheme to MCP metadata"

#### 3.2: Configure ChatGPT App OAuth
- **Manual step** (done in ChatGPT developer console)
- **Document:** Create file `docs/oauth-setup.md` with screenshots
- **Steps:**
  1. Go to ChatGPT App settings
  2. Set OAuth endpoint to `https://figma-calgpt-project-v2.vercel.app/mcp`
  3. Configure Supabase as auth provider
  4. Test: OAuth "Sign In" button appears in ChatGPT
- **Commit:** "Document ChatGPT OAuth configuration (manual step)"

#### 3.3: Set ALLOW_DEMO_MODE=false (Staged)
- **Step 1 (Canary):** Deploy new code with `ALLOW_DEMO_MODE=true` (no behavior change yet)
  - New code: `resolveIdentity()` still falls back to demo user
  - Existing functionality unchanged
  - Monitor for 24 hours
  - Commit: "Deploy auth changes with demo mode still on (canary)"

- **Step 2 (Enable OAuth):** `ALLOW_DEMO_MODE=false` on production
  - Vercel environment variables → set `ALLOW_DEMO_MODE=false`
  - Redeploy main branch (no code change, just env)
  - Unauthenticated requests now return `authRequired: true`
  - ChatGPT shows OAuth "Sign In" prompt
  - Commit message (tag): "Release: Enable OAuth, disable demo mode"

- **Rollback (if needed):** Flip `ALLOW_DEMO_MODE=true`, redeploy
  - All existing users can access again
  - OAuth still available for new users

#### 3.4: Detect New Users & Trigger Onboarding
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** Add `isNewUser` flag to user profile
- **Logic:**
  ```typescript
  const isNewUser = !goals.calories || goals.calories === DEFAULT_GOALS.calories;
  ```
- **Response:** Include `isNewUser` in `get_user_profile` and `sync_state`
- **Test:** Unit test in auth.test.ts
- **Commit:** "Detect new users in profile response"

#### 3.5: Tool Description for Onboarding
- **File:** `api/mcp.ts`
- **Change:** Update `sync_state` or `get_user_profile` description
- **New guidance:**
  > If this is the user's first conversation (isNewUser=true), ask them for: 1. Daily calorie goal 2. Nutrition goals (protein, carbs, fats) 3. Current and goal weight 4. Height 5. Any dietary restrictions (vegetarian, allergies, etc). Save these using update_goals and save_agent_note.
- **Commit:** "Add onboarding guidance to tool descriptions"

#### 3.6: Keep Demo Mode for Local Dev
- **File:** `.env.local` (dev only)
- **Change:** Add `ALLOW_DEMO_MODE=true`
- **Effect:** Local dev harness still works without OAuth
- **Note:** `.env.local` should NOT be committed; document in README
- **Commit:** "Document local dev setup with demo mode"

### Deploy Sequence (Critical)

```
Day 1 (Canary):
├── Merge to main with ALLOW_DEMO_MODE=true
├── Deploy to production
├── Monitor logs for 24h
└── No behavioral change yet

Day 2 (Enable OAuth):
├── Set ALLOW_DEMO_MODE=false in Vercel env
├── Redeploy (no code change)
├── Monitor logs for auth rejections
├── If problems: flip ALLOW_DEMO_MODE=true immediately

Day 3+ (Monitor):
├── Watch error rates
├── Verify OAuth flow works end-to-end
├── Check new user onboarding completes
└── Monitor Sentry for auth issues
```

### Test Scenarios

```
auth.test.ts
├── valid bearer token → resolves real user ID
├── invalid bearer token + ALLOW_DEMO_MODE=false → authRequired
├── missing bearer token + ALLOW_DEMO_MODE=false → authRequired
├── missing bearer token + ALLOW_DEMO_MODE=true → demo user (old behavior)
└── ALLOW_DEMO_MODE toggle doesn't break existing tools

onboarding.test.ts
├── new user profile has isNewUser=true
├── user with custom goals has isNewUser=false
├── sync_state includes onboarding hint
└── after update_goals, isNewUser becomes false

oauth-manual-checklist.md
├── ChatGPT shows "Sign in" button (visual)
├── Click → OAuth redirect to Supabase
├── After login → token forwarded to tools
├── Tool calls succeed with real user ID
├── Second conversation reuses auth (no re-login)
└── Revoke access → tools return authRequired
```

### Exit Criteria

- [ ] OAuth metadata in MCP initialize response
- [ ] ChatGPT app configured with OAuth
- [ ] Staged rollout: canary → enable → monitor
- [ ] New users detected correctly
- [ ] Onboarding triggered for new users
- [ ] Unauthenticated requests rejected in production
- [ ] Demo mode works locally for dev
- [ ] All auth tests pass
- [ ] Manual OAuth flow works end-to-end

---

## Phase 4: Widget Polish

**Agent:** `phase-4-widget-polish`
**Branch:** `phase/4-widget-polish`
**Duration:** 8-10 hours
**Risk Level:** Low (UI-only, no backend changes)

### Tasks

#### 4.1: Add 7-Day Calorie Sparkline
- **File:** `public/component.html`
- **Change:** In Progress page, show 7 vertical bars for daily calories
- **Data source:** `progress.weeklyEnergy.daily` (7 objects with `day`, `consumed`)
- **Render:**
  ```html
  <div class="sparkline">
    <div class="bar" style="height: ${(consumed/maxConsumed)*100}%"></div>
    <!-- repeat 7 times -->
  </div>
  ```
- **CSS:** Bar chart style, responsive width
- **Test:** Visual checklist
  - Renders 7 bars
  - Tallest bar = max consumed day
  - Zero days show empty bar
  - Responsive on mobile
- **Commit:** "Add 7-day calorie sparkline to progress page"

#### 4.2: Add SVG Weight Trend Line Chart
- **File:** `public/component.html`
- **Change:** In Progress page, show line chart of weight over time
- **Data source:** `progress.weightSeries` array of `{ date, weight }`
- **Render:** SVG `<polyline>` from points
- **Axis labels:** Start date, end date, min/max weight
- **Test:** Visual checklist
  - Renders line with dots
  - No data → "No weight data" message
  - Single point → horizontal line
  - Y-axis auto-scales
- **Commit:** "Add weight trend line chart"

#### 4.3: Add Streak Dot Grid
- **File:** `public/component.html`
- **Change:** In Progress page, show 7-day grid of hit/miss dots
- **Data source:** `progress.streak.week` (7 objects with `day`, `hit`)
- **Render:**
  ```html
  <div class="streak-grid">
    <div class="dot hit" title="Mon: Logged meals">●</div>
    <!-- repeat 7 times -->
  </div>
  ```
- **CSS:** Green dots for hits, gray for miss
- **Test:** Visual checklist
  - 7 dots displayed
  - Hit days colored green
  - Miss days colored gray
  - Today is rightmost dot
- **Commit:** "Add 7-day streak dot grid"

#### 4.4: Add "Log Again" Quick-Log Buttons
- **File:** `public/component.html`
- **Change:** In Home page, after meal list, show "Recent meals" quick buttons
- **Data source:** `get_recent_meals` tool result
- **Render:**
  ```html
  <div class="quick-log">
    <button data-action="quick-log" data-meal-name="Oatmeal">Oatmeal</button>
    <!-- repeat for recent -->
  </div>
  ```
- **Handler:**
  ```javascript
  if (action === 'quick-log') {
    const mealName = target.getAttribute('data-meal-name');
    // Find meal in state or recent meals
    const meal = recentMeals.find(m => m.name === mealName);
    await callTool('log_meal', {
      name: meal.name,
      calories: meal.avgCalories,
      protein: meal.protein,
      carbs: meal.carbs,
      fats: meal.fats
    });
    await sync('home');
  }
  ```
- **Test:** Manual
  - Shows recent meals as buttons
  - Click logs meal
  - Syncs home page
  - Handles empty recent
- **Commit:** "Add quick-log buttons for recent meals"

#### 4.5: Add CSS Transitions
- **File:** `public/component.html`
- **Change:** Smooth page transitions + ring animation
- **CSS:**
  ```css
  #content {
    transition: opacity 0.3s ease-in-out;
  }

  .ring svg circle:nth-child(2) {
    animation: fillRing 1s ease-out;
  }

  @keyframes fillRing {
    from { stroke-dashoffset: <full>; }
    to { stroke-dashoffset: <current>; }
  }
  ```
- **Test:** Manual visual inspection
  - Page switch animates (opacity/slide)
  - Ring fill animates on load
  - No layout shift
- **Commit:** "Add CSS transitions and animations"

#### 4.6: Wire Theme Preset Support
- **File:** `public/component.html`
- **Change:** Map `prefs.themePreset` to CSS color scheme
- **CSS variables:**
  ```css
  :root {
    --accent: #34d399; /* midnight (default) */
  }

  /* Themes */
  body[data-theme="ocean"] {
    --accent: #0ea5e9; /* blue */
  }

  body[data-theme="forest"] {
    --accent: #22c55e; /* green */
  }

  body[data-theme="sunset"] {
    --accent: #f97316; /* orange */
  }
  ```
- **Handler:**
  ```javascript
  function applyTheme(themePreset) {
    document.body.setAttribute('data-theme', themePreset);
    localStorage.setItem('theme', themePreset);
  }
  ```
- **Test:** Manual visual inspection
  - Midnight (dark blue, default green accent)
  - Ocean (lighter blue, cyan accent)
  - Forest (dark green, bright green accent)
  - Sunset (warm, orange accent)
  - Theme persists across refreshes
- **Commit:** "Add theme preset support with CSS variables"

#### 4.7: Display Agent Notes in Settings
- **File:** `public/component.html`
- **Change:** In Settings page, show saved agent notes as cards
- **Render:**
  ```html
  <div class="agent-notes">
    <h3>Saved observations</h3>
    <div class="note">
      <span class="key">diet:vegetarian</span>
      <span class="value">Vegetarian, avoids fish</span>
      <button data-action="delete-note" data-key="diet:vegetarian">✕</button>
    </div>
    <!-- repeat for each note -->
  </div>
  ```
- **Handler:**
  ```javascript
  if (action === 'delete-note') {
    const key = target.getAttribute('data-key');
    await callTool('delete_agent_note', { note_key: key });
    await sync('settings');
  }
  ```
- **Test:** Manual
  - Notes display as cards
  - Delete button removes note
  - Empty state message
  - escapeHtml applied to all text
- **Commit:** "Display agent notes in settings page"

### Test Sequence (Phase 4)

```bash
git checkout -b phase/4-widget-polish origin/phase/3-auth-realusers

# Tasks 4.1-4.7 have no unit tests (all visual/manual)
# Just run contract checks to ensure structure intact

npm run check:widget-contract
# Should still pass (all integration tokens present)

npm run build
# Should still pass (no code changes, just HTML)

# Manual visual testing
# (Done by human, checklist in SHIP_PLAN.md)

npm run test:strict
# All existing tests still pass
```

### Exit Criteria

- [ ] Widget contract check passes
- [ ] All visual elements render on mobile (375px) and desktop (820px)
- [ ] No XSS vectors (escapeHtml on all user data)
- [ ] Theme switching works
- [ ] Quick-log works end-to-end
- [ ] Manual test in ChatGPT iframe: all pages look correct

---

## Phase 5: Proactive Coaching

**Agent:** `phase-5-proactive-coaching`
**Branch:** `phase/5-proactive-coaching`
**Duration:** 10-12 hours
**Risk Level:** Medium (behavior change to existing tools)

### Pattern Detection Engine

**File:** `supabase/functions/server/mcp_handler.tsx` (new helper functions)

```typescript
// Helper functions for pattern detection
function detectProteinDeficit(weekData) { /* ... */ }
function detectCalorieOverconsumption(weekData) { /* ... */ }
function detectSkippedMeals(weekData) { /* ... */ }
function detectLateNightEating(weekData) { /* ... */ }
function detectWeightPlateau(weights) { /* ... */ }
function calculateGoalProjection(weights, goal) { /* ... */ }
function detectStreakMilestone(streak) { /* ... */ }
function detectMacroImbalance(weekData, goals) { /* ... */ }
```

### Tasks

#### 5.1: Implement Pattern Detection Logic
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Implement 8 pattern detectors:**
  1. **Protein deficit** (< 70% goal for 4+ of 7 days)
  2. **Calorie overconsumption** (> 110% goal for 3+ of 7 days)
  3. **Skipped meals** (0 meals on any day in last 7)
  4. **Late-night eating** (2+ meals after 21:00 in last 7)
  5. **Weight plateau** (variance < 0.2 over 14+ days)
  6. **Weight goal projection** (days to goal at current rate)
  7. **Streak milestone** (7, 14, 30, 60, 90, 180, 365 days)
  8. **Macro imbalance** (one macro > 150% goal consistently)
- **Return shape:** `{ type, severity, message, actionable }`
- **Unit test:** `tests/unit/patterns.test.ts` (25 tests)
  - Each pattern triggers correctly
  - Each pattern doesn't trigger on edge cases
  - Messages are clear and actionable
- **Commit:** "Add pattern detection engine"

#### 5.2: Enhance Weekly Review with Patterns
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** `runWeeklyReview()` calls all pattern detectors
- **Response:**
  ```typescript
  {
    success: true,
    review: {
      period: "last_7_days",
      insights: [
        "Protein deficit detected. You've been under goal 5/7 days. Add high-protein snacks.",
        "Weight trend is down 0.8 lb this week. At this rate, you'll reach your goal by June 15."
      ],
      patterns: [
        { type: "protein_deficit", severity: "medium", ... },
        { type: "weight_projection", severity: "positive", ... }
      ]
    }
  }
  ```
- **Commit:** "Enhance weekly review with pattern detection"

#### 5.3: Add Goal Progress Projection
- **File:** `supabase/functions/server/mcp_handler.tsx` (in `calculateGoalProjection` helper)
- **Logic:**
  ```typescript
  // Last 30 days weight data
  const weeklyTrend = weights.slice(-30);
  const firstWeight = weeklyTrend[0];
  const lastWeight = weeklyTrend[weeklyTrend.length - 1];
  const changePerDay = (lastWeight - firstWeight) / 30;

  if (changePerDay === 0) return null; // No trend

  const daysToGoal = Math.abs((goal - lastWeight) / changePerDay);
  const projectedDate = addDaysToIsoDate(today, daysToGoal);

  return { projectedDate, daysRemaining: daysToGoal, trajectory: changePerDay };
  ```
- **Handle:** Weight gain goals (bulking), weight loss goals (cutting)
- **Unit test:** Included in patterns.test.ts
- **Commit:** "Add goal weight projection calculation"

#### 5.4: Detect Weight Plateau
- **File:** `supabase/functions/server/mcp_handler.tsx` (in `detectWeightPlateau` helper)
- **Logic:**
  ```typescript
  if (weights.length < 14) return null; // Insufficient data

  const last14 = weights.slice(-14);
  const min = Math.min(...last14.map(w => w.weight));
  const max = Math.max(...last14.map(w => w.weight));
  const variance = max - min;

  if (variance < 0.2) {
    return {
      type: 'weight_plateau',
      severity: 'medium',
      message: 'Your weight has plateaued for 2 weeks. Consider adjusting calories or activity.'
    };
  }
  ```
- **Unit test:** Included in patterns.test.ts
- **Commit:** "Add weight plateau detection"

#### 5.5: Add Milestone Badge Triggers
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** `buildProgress()` checks streak milestones
- **Logic:**
  ```typescript
  const milestones = [7, 14, 30, 60, 90, 180, 365];

  for (const ms of milestones) {
    if (streak === ms) {
      await supabase.from('badge_events').upsert({
        user_id: userId,
        badge_code: `streak_${ms}`,
        awarded_at: now()
      });
    }
  }
  ```
- **Return:** New badge code in progress.badges
- **Unit test:** Included in patterns.test.ts
- **Commit:** "Add milestone badge triggers"

#### 5.6: Update Tool Descriptions for Proactive Use
- **File:** `api/mcp.ts`
- **Change:** Tell ChatGPT to call tools proactively
- **Examples:**
  ```typescript
  {
    name: 'run_weekly_review',
    description: 'Call this every Friday or Sunday to discuss trends and patterns with the user. Include insights about protein intake, weight trajectory, streaks, and detected patterns.'
  },
  {
    name: 'get_user_profile',
    description: 'Call at the start of every conversation to get full context. Includes notes, streaks, BMI, and isNewUser flag.'
  }
  ```
- **Commit:** "Update tool descriptions for proactive coaching"

### Test Sequence (Phase 5)

```bash
git checkout -b phase/5-proactive-coaching origin/phase/4-widget-polish

# Implement pattern detection
npm run test:unit # New 25 tests in patterns.test.ts pass

# Enhance weekly review, projections, milestones
npm run test:unit # All tests pass

# Update tool descriptions
npm run check:mcp-contract # Passes

# Full gate
npm run test:strict
```

### Exit Criteria

- [ ] 8 pattern types detected correctly
- [ ] Weekly review includes detected patterns
- [ ] Goal projection calculates realistic date
- [ ] Plateau detection works with real weight data
- [ ] Milestone badges trigger at correct streaks
- [ ] 25+ new unit tests pass
- [ ] Manual test: log meals with patterns → review mentions them

---

## Phase 6: Cleanup & Hardening

**Agent:** `phase-6-cleanup-hardening`
**Branch:** `phase/6-cleanup-hardening`
**Duration:** 8-10 hours
**Risk Level:** Low (deletions are additive in reverse, can be reverted easily)

### Tasks

#### 6.1: Delete Unused React Components
- **Files to delete:**
  - `src/app/components/ui/` (65+ shadcn/ui component files)
  - `src/app/components/ChatInterface.tsx`
  - `src/app/components/HealthRing.tsx`
  - `src/app/components/MealLog.tsx`
  - `src/app/components/figma/ImageWithFallback.tsx`
  - `src/styles/` (Tailwind config will auto-generate)
- **Verification:**
  ```bash
  # Before deletion:
  npm run build      # Should pass
  npm run test:unit  # Should pass

  # After deletion:
  npm run build      # Should still pass
  npm run test:unit  # Should still pass
  ```
- **Commit:** "Delete unused React components and UI library"

#### 6.2: Simplify App.tsx
- **File:** `src/app/App.tsx`
- **Change:** Remove React Router imports, keep only minimal dev harness
- **New content:**
  ```typescript
  // Minimal dev harness for testing widget locally
  // This is not production code
  export default function App() {
    return (
      <div className="...">
        <h1>CalGPT Dev Harness</h1>
        <iframe src="/component.html" />
      </div>
    );
  }
  ```
- **Verification:** `npm run check:ui-shell` still passes
- **Commit:** "Simplify App.tsx to minimal harness"

#### 6.3: Remove Unused Dependencies
- **File:** `package.json`
- **Remove:**
  - All `@radix-ui/*` packages
  - `@emotion/*`, `@mui/*`, `@popperjs/core`
  - `react-router`, `react-hook-form`, `react-dnd*`
  - `recharts`, `react-day-picker`, `date-fns`
  - `motion`, `embla-carousel-react`, `tw-animate-css`
  - `react-resizable-panels`, `react-responsive-masonry`, `react-slick`
  - `openai` package (not needed, MCP is JSON-RPC)
- **Verify:**
  ```bash
  npm install
  npm run build
  npm run test:unit
  npm run test:strict
  ```
- **Expected:** Build output shrinks from 176KB to ~50KB
- **Commit:** "Remove 25+ unused dependencies"

#### 6.4: Add Sentry Error Tracking
- **File:** `api/mcp.ts`
- **Setup:**
  ```typescript
  import * as Sentry from "@sentry/node";

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1
  });
  ```
- **Usage in handler:**
  ```typescript
  try {
    // ... tool handler logic
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        tool: method,
        userId: identity.userId
      }
    });
    throw error;
  }
  ```
- **Env:** Add `SENTRY_DSN` to Vercel
- **Test:** Manual — throw error in tool, check Sentry dashboard
- **Commit:** "Add Sentry error tracking to MCP gateway"

#### 6.5: Add Structured JSON Logging
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **Change:** Replace `console.log()` with structured JSON
- **Pattern:**
  ```typescript
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    tool: 'log_meal',
    userId: userId,
    status: 'success',
    duration_ms: Date.now() - startTime
  }));
  ```
- **Verify:** Logs are parseable JSON in Supabase function logs
- **Commit:** "Add structured JSON logging to tool handlers"

#### 6.6: Implement Rate Limiting
- **File:** `supabase/functions/server/mcp_handler.tsx`
- **New helper:**
  ```typescript
  async function checkRateLimit(userId: string, tool: string) {
    // Redis or Supabase RLS table: rate_limits(user_id, tool, count, reset_at)
    // Allow 4 writes per 10 seconds per user per tool
    // Allow unlimited reads
  }
  ```
- **Apply to write tools:** `logMeal`, `deleteMeal`, `logWeight`, `updateGoals`, `updatePreferences`, `uploadProgressPhoto`
- **Response on limit:**
  ```typescript
  {
    success: false,
    error: "rate_limited",
    retryAfter: 8
  }
  ```
- **Unit test:** `tests/unit/rate-limiting.test.ts` (7 tests)
  - First 4 writes succeed
  - 5th write rejected
  - Different users have independent limits
  - Read tools not limited
- **Commit:** "Add rate limiting to write tools"

#### 6.7: Add Health Check Cron
- **File:** `.github/workflows/health-check.yml`
- **Trigger:** Every 5 minutes (cron)
- **Steps:**
  ```yaml
  - name: Health check MCP endpoint
    run: |
      curl -f https://figma-calgpt-project-v2.vercel.app/mcp \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' \
        || (echo "FAIL"; exit 1)

  - name: Slack notification on failure
    if: failure()
    run: |
      curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
        -d '{"text":"CalGPT MCP endpoint is down"}'
  ```
- **Setup:** Add `SLACK_WEBHOOK` to GitHub secrets
- **Test:** Manual — verify Slack message on failure
- **Commit:** "Add 5-minute health check cron"

#### 6.8: Run Full Deletion Safety Protocol
- **Order:**
  1. Commit existing tests
  2. Delete UI components + simplify App.tsx (1 batch)
  3. Run `npm run test:strict` → passes
  4. Commit
  5. Delete dependencies (1 batch)
  6. Run `npm run test:strict` → passes
  7. Commit
  8. Add Sentry, logging, rate limiting (1 batch)
  9. Run `npm run test:strict` → passes
  10. Commit
  11. Add health check cron (1 batch)
  12. Commit

### Test Sequence (Phase 6)

```bash
git checkout -b phase/6-cleanup-hardening origin/phase/5-proactive-coaching

# Batch 1: Delete components
npm run test:strict  # All tests pass
git commit -m "Delete unused React components"

# Batch 2: Delete dependencies
npm install
npm run build       # Output should be 50KB
npm run test:strict # All tests pass
git commit -m "Remove 25+ unused dependencies"

# Batch 3: Hardening
npm run test:unit   # Rate limiting tests pass
npm run check:mcp-contract  # Sentry doesn't affect contract
npm run test:strict # All tests pass
git commit -m "Add Sentry, structured logging, rate limiting"

# Batch 4: Health check
npm run test:strict # Health check is GitHub Actions only
git commit -m "Add 5-minute health check cron"
```

### Exit Criteria

- [ ] src/app/components/ui/ deleted (65+ files)
- [ ] package.json has <15 runtime dependencies
- [ ] Build output < 50KB
- [ ] Sentry receiving errors
- [ ] JSON logs in Supabase function logs
- [ ] Rate limiting on write tools
- [ ] Health check cron pings endpoint every 5 minutes
- [ ] All existing tests still pass
- [ ] Manual test: throw error in tool, verify in Sentry

---

## Phase Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Orchestrator: CalGPT Shipping Plan                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
         ┌──────▼──────┐   ┌──────▼──────┐   ┌─────▼─────────┐
         │ Phase 0     │   │ Phase 1     │   │ Phase 2       │
         │ CI/CD       │   │ Agent Intel │   │ Agent Memory  │
         │ Setup       │   │             │   │               │
         │ (4-6h)      │   │ (8-10h)     │   │ (6-8h)        │
         │ Risk: None  │   │ Risk: Low   │   │ Risk: Low     │
         └──────┬──────┘   └──────┬──────┘   └─────┬─────────┘
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  Phase 3                    │
                    │  Auth & Real Users          │
                    │  (10-12h)                   │
                    │  Risk: High (staged)        │
                    │  Gate: Manual OAuth test    │
                    └─────────┬────────┬──────────┘
                              │        │
                    ┌─────────▼┐  ┌───▼────────────┐
                    │ Phase 4  │  │ Phase 5        │
                    │ Widget   │  │ Proactive      │
                    │ Polish   │  │ Coaching       │
                    │ (8-10h)  │  │ (10-12h)       │
                    │ Risk: Low│  │ Risk: Medium   │
                    └─────┬────┘  └────┬───────────┘
                          │            │
                          └─────┬──────┘
                                │
                        ┌───────▼───────────┐
                        │ Phase 6           │
                        │ Cleanup &         │
                        │ Hardening         │
                        │ (8-10h)           │
                        │ Risk: Low         │
                        └───────┬───────────┘
                                │
                        ┌───────▼───────────┐
                        │ PRODUCTION READY  │
                        │ ChatGPT Plugin    │
                        │ Deployed & Live   │
                        └───────────────────┘
```

---

## Execution Commands

### Start a Phase

```bash
# Clone/update main
git fetch origin main
git checkout main
git pull origin main

# Create phase branch
git checkout -b phase/N-name origin/main

# (Agent executes tasks...)

# When done, test fully
npm run test:strict

# If all pass:
git push origin phase/N-name
# Create PR on GitHub, GitHub Actions runs gate
# If gate passes, merge to main
```

### Rollback a Phase

```bash
# If deployed and broken:
git revert <commit-hash>
git push origin main
# Vercel auto-redeploys

# Or manually on Vercel:
# Dashboard → Deployments → Promote previous version
```

### Monitor Production

```bash
# Check Vercel logs
# Check Sentry dashboard
# Check health check cron (GitHub Actions)
# Check Supabase function logs

# If issues detected:
# Revert immediately
# Post-mortem: why did gate not catch it?
# Update tests
```

---

## Success Metrics

| Phase | Metric |
|-------|--------|
| **0** | 40+ unit tests running, 0 failures |
| **1** | All 11 tools have coaching descriptions, 40+ new tests |
| **2** | Agent notes persist across 2+ conversations |
| **3** | Real users can authenticate and create isolated data |
| **4** | Widget renders correctly on mobile/desktop, no XSS |
| **5** | Weekly review detects 3+ patterns correctly |
| **6** | Codebase <10 runtime deps, build <50KB, Sentry live |
| **Final** | ChatGPT app ships with agent-driven coaching, no breaking changes |

---

## Orchestrator Next Steps

When ready to execute:

1. **Confirm Phase 0 start:** Agent `phase-0-ci-setup` begins
2. **Monitor PR gate:** All tests must pass before merge
3. **Phase completion:** Agent reports exit criteria met
4. **Phase merge:** PR merges to main, Vercel deploys
5. **Next phase:** Agent `phase-1-agent-intelligence` begins
6. **Repeat** until Phase 6 complete

**Current Status:** Ready to begin Phase 0

**To start:** Reply with "Begin Phase 0" and orchestrator will spawn the CI setup agent.

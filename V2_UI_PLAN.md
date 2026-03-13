# V2 UI Plan: Progress + Settings

## Goal

Add a mobile-first `Progress` experience and `Settings` page aligned to the screenshots, and make goals/preferences fully functional end-to-end.

## Scope (V2)

1. Add new app shell with bottom navigation.
2. Add `Progress` page with cards/charts and period filters.
3. Add `Settings` page with user preferences and goals editing.
4. Persist preferences, goals, and weight history in backend.
5. Keep existing meal logging and dashboard behavior working.

## Screens

1. `Home` (existing dashboard)
2. `Progress` (new)
3. `Settings` (new, under profile/settings nav)

## UI Breakdown

### Progress Page

1. Header title: `Progress`.
2. KPI cards:
   - Day streak
   - Badges earned
3. Weight summary card:
   - Current weight
   - Start/goal weight
   - CTA `Log weight`
4. Weight progress chart:
   - Line chart
   - Range tabs (`90D`, `6M`, `1Y`, `ALL`)
5. Weight change table:
   - `3d`, `7d`, `14d`, `30d`, `90d`, `All Time`
6. Daily average calories chart:
   - Weekly bars with segmented colors
7. Weekly energy chart:
   - Burned/consumed bars + summary totals
8. BMI card:
   - Current BMI + range indicator
9. Progress photos card:
   - Upload CTA + thumbnail grid

### Settings Page

1. Account section:
   - Personal details
   - Preferences
   - Language
2. Goals and tracking section:
   - Edit nutrition goals
   - Goals and current weight
   - Tracking reminders
   - Weight history
   - Ring color explanation
3. Integrations:
   - Apple Health connection status
4. Preferences detail panel:
   - Units (`kg/lb`, `kcal/kJ`)
   - Daily reminder time
   - Theme/accent preset
   - Streak/badge notifications

## Data Model (Backend)

Add user-scoped documents/tables:

1. `user_preferences`
   - `user_id`
   - `unit_weight` (`kg|lb`)
   - `unit_energy` (`kcal|kJ`)
   - `language`
   - `reminder_enabled`
   - `reminder_time`
   - `theme_preset`
2. `user_goals`
   - `calories`
   - `protein`
   - `carbs`
   - `fats`
   - `goal_weight`
   - `start_weight`
   - `target_date`
3. `weight_entries`
   - `id`
   - `user_id`
   - `date`
   - `weight`
4. `progress_photos`
   - `id`
   - `user_id`
   - `date`
   - `image_url`

## API and MCP Updates

Reuse existing tools where possible and add these:

1. `log_weight`
2. `get_progress`
3. `update_preferences`
4. `get_preferences`
5. Extend `update_goals` to include weight goal fields.

Response rule:

1. Return chart-ready `structuredContent` for Progress widgets.
2. Keep large optional payloads in `_meta`.

## Frontend Architecture Changes

1. Introduce routes with `react-router`.
2. Create pages:
   - `src/app/pages/HomePage.tsx`
   - `src/app/pages/ProgressPage.tsx`
   - `src/app/pages/SettingsPage.tsx`
3. Create shared app shell:
   - `src/app/layout/AppShell.tsx`
   - persistent bottom nav
4. Create feature components:
   - `ProgressKpiCards.tsx`
   - `WeightProgressChart.tsx`
   - `WeightChangesTable.tsx`
   - `WeeklyEnergyChart.tsx`
   - `BmiCard.tsx`
   - `PreferencesForm.tsx`
   - `GoalsForm.tsx`
5. Add service layer:
   - `src/app/services/progressApi.ts`
   - `src/app/services/preferencesApi.ts`

## Implementation Phases

1. Phase 1: App shell + routing + static Progress/Settings UI.
2. Phase 2: Backend schema + API/tool endpoints.
3. Phase 3: Wire forms, charts, and mutations.
4. Phase 4: Validation, edge cases, loading/empty/error states.
5. Phase 5: Mobile polish and connector verification in ChatGPT.

## Acceptance Criteria

1. User can edit and save nutrition goals from Settings.
2. User can log weight and see progress chart update immediately.
3. Weight change rows compute correctly for all ranges.
4. Progress page works on mobile widths without overflow.
5. Preferences persist across reloads.
6. Existing meal logging and daily ring continue to work.
7. MCP connector still returns widget + valid tools metadata.

## Out of Scope for V2

1. Social/groups logic.
2. Payment/referral mechanics.
3. Full Apple Health sync implementation details.


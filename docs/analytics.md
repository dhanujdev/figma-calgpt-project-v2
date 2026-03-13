# Analytics

CalGPT beta metrics are derived from `public.analytics_events`.

The current reporting layer is SQL-first, not app-facing. That is intentional: the team can answer activation, drop-off, and retention questions without expanding the MCP surface again.

## Reporting Views

Apply migrations, then query these views in Supabase SQL editor.

### `public.beta_user_activation`

One row per user with first-seen timestamps for:

- `first_dashboard_open_at`
- `first_meal_logged_at`
- `first_weight_logged_at`
- `first_daily_checkin_at`
- `first_weekly_review_at`
- `first_tool_error_at`

Use this when you need a per-user activation table.

### `public.beta_funnel_summary`

Single-row summary for the core beta funnel:

- active users
- users who opened the dashboard
- users who logged a first meal
- users who logged a first weight
- users who ran a first daily check-in
- users who ran a first weekly review
- conversion rates from dashboard to meal, weight, check-in, and review
- percent of users who hit any tool error

Primary query:

```sql
select *
from public.beta_funnel_summary;
```

### `public.beta_retention_summary`

One row per cohort date with:

- `cohort_users`
- `retained_day_1_users`
- `retained_day_1_pct`
- `retained_day_7_users`
- `retained_day_7_pct`

Primary query:

```sql
select *
from public.beta_retention_summary
order by cohort_date desc;
```

### `public.beta_prompt_dropoff`

Aggregates users by furthest completed stage:

- `dashboard_only`
- `meal_logged`
- `weight_logged`
- `daily_checkin`
- `weekly_review`

Primary query:

```sql
select *
from public.beta_prompt_dropoff;
```

Interpretation:

- high `dashboard_only` means onboarding or first-action prompts are weak
- high `meal_logged` but low `weight_logged` means the progress loop is not clear enough
- high `daily_checkin` but low `weekly_review` means the weekly value proposition is not landing

### `public.beta_empty_state_recovery`

Measures how many new users recovered from an empty dashboard to a first logged meal.

Primary query:

```sql
select *
from public.beta_empty_state_recovery;
```

This is the current proxy for empty-state recovery because `dashboard_open` already carries `detail.isNewUser`.

## Weekly Review Queries

Run these each week during beta:

```sql
select *
from public.beta_funnel_summary;

select *
from public.beta_prompt_dropoff;

select *
from public.beta_empty_state_recovery;

select *
from public.beta_retention_summary
order by cohort_date desc
limit 14;
```

## Questions This Should Answer

- Are users opening the dashboard but not taking a first action?
- Are users logging meals but skipping weight logging?
- Are daily check-ins being used but weekly reviews ignored?
- Are new users recovering from the empty state?
- Is day-1 retention improving?
- Is day-7 retention improving?

## Current Gaps

- There is no separate onboarding-start event yet; empty-state recovery is inferred from `dashboard_open.detail.isNewUser`.
- There is no prompt-text capture; prompt drop-off is stage-based, not NLP-based.
- These views are intended for internal beta analysis through Supabase SQL, not direct user-facing app access.

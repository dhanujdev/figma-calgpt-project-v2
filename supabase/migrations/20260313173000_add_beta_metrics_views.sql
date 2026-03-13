-- Rollback SQL:
-- drop view if exists public.beta_empty_state_recovery;
-- drop view if exists public.beta_prompt_dropoff;
-- drop view if exists public.beta_retention_summary;
-- drop view if exists public.beta_funnel_summary;
-- drop view if exists public.beta_user_activation;

create or replace view public.beta_user_activation as
select
  user_id,
  min(created_at) as first_activity_at,
  min(created_at) filter (where event_name = 'dashboard_open') as first_dashboard_open_at,
  min(created_at) filter (where event_name = 'meal_logged') as first_meal_logged_at,
  min(created_at) filter (where event_name = 'weight_logged') as first_weight_logged_at,
  min(created_at) filter (where event_name = 'daily_checkin_run') as first_daily_checkin_at,
  min(created_at) filter (where event_name = 'weekly_review_run') as first_weekly_review_at,
  min(created_at) filter (where event_name = 'tool_error') as first_tool_error_at,
  count(*) filter (where event_name = 'dashboard_open') as dashboard_open_events,
  count(*) filter (where event_name = 'meal_logged') as meal_logged_events,
  count(*) filter (where event_name = 'weight_logged') as weight_logged_events,
  count(*) filter (where event_name = 'daily_checkin_run') as daily_checkin_events,
  count(*) filter (where event_name = 'weekly_review_run') as weekly_review_events,
  count(*) filter (where event_name = 'tool_error') as tool_error_events
from public.analytics_events
group by user_id;

create or replace view public.beta_funnel_summary as
with activation as (
  select *
  from public.beta_user_activation
)
select
  count(*) filter (where first_activity_at is not null) as active_users,
  count(*) filter (where first_dashboard_open_at is not null) as users_opened_dashboard,
  count(*) filter (where first_meal_logged_at is not null) as users_logged_first_meal,
  count(*) filter (where first_weight_logged_at is not null) as users_logged_first_weight,
  count(*) filter (where first_daily_checkin_at is not null) as users_ran_first_checkin,
  count(*) filter (where first_weekly_review_at is not null) as users_ran_first_review,
  round(
    100.0 * count(*) filter (where first_meal_logged_at is not null)
    / nullif(count(*) filter (where first_dashboard_open_at is not null), 0),
    1
  ) as meal_after_dashboard_pct,
  round(
    100.0 * count(*) filter (where first_weight_logged_at is not null)
    / nullif(count(*) filter (where first_dashboard_open_at is not null), 0),
    1
  ) as weight_after_dashboard_pct,
  round(
    100.0 * count(*) filter (where first_daily_checkin_at is not null)
    / nullif(count(*) filter (where first_dashboard_open_at is not null), 0),
    1
  ) as checkin_after_dashboard_pct,
  round(
    100.0 * count(*) filter (where first_weekly_review_at is not null)
    / nullif(count(*) filter (where first_dashboard_open_at is not null), 0),
    1
  ) as review_after_dashboard_pct,
  round(
    100.0 * count(*) filter (where first_tool_error_at is not null)
    / nullif(count(*) filter (where first_activity_at is not null), 0),
    1
  ) as users_with_any_tool_error_pct
from activation;

create or replace view public.beta_retention_summary as
with cohorts as (
  select
    user_id,
    (first_activity_at at time zone 'UTC')::date as cohort_date
  from public.beta_user_activation
  where first_activity_at is not null
),
returns as (
  select
    cohorts.user_id,
    cohorts.cohort_date,
    max(case when (events.created_at at time zone 'UTC')::date = cohorts.cohort_date + 1 then 1 else 0 end) as returned_day_1,
    max(case when (events.created_at at time zone 'UTC')::date = cohorts.cohort_date + 7 then 1 else 0 end) as returned_day_7
  from cohorts
  left join public.analytics_events events
    on events.user_id = cohorts.user_id
   and (events.created_at at time zone 'UTC')::date > cohorts.cohort_date
  group by cohorts.user_id, cohorts.cohort_date
)
select
  cohort_date,
  count(*) as cohort_users,
  sum(returned_day_1) as retained_day_1_users,
  round(100.0 * sum(returned_day_1) / nullif(count(*), 0), 1) as retained_day_1_pct,
  sum(returned_day_7) as retained_day_7_users,
  round(100.0 * sum(returned_day_7) / nullif(count(*), 0), 1) as retained_day_7_pct
from returns
group by cohort_date
order by cohort_date desc;

create or replace view public.beta_prompt_dropoff as
with activation as (
  select *
  from public.beta_user_activation
),
stages as (
  select
    case
      when first_weekly_review_at is not null then 'weekly_review'
      when first_daily_checkin_at is not null then 'daily_checkin'
      when first_weight_logged_at is not null then 'weight_logged'
      when first_meal_logged_at is not null then 'meal_logged'
      when first_dashboard_open_at is not null then 'dashboard_only'
      else 'no_activation'
    end as furthest_stage
  from activation
)
select
  furthest_stage,
  count(*) as users
from stages
group by furthest_stage
order by
  case
    when furthest_stage = 'weekly_review' then 5
    when furthest_stage = 'daily_checkin' then 4
    when furthest_stage = 'weight_logged' then 3
    when furthest_stage = 'meal_logged' then 2
    when furthest_stage = 'dashboard_only' then 1
    else 0
  end desc;

create or replace view public.beta_empty_state_recovery as
with first_dashboard as (
  select distinct on (user_id)
    user_id,
    created_at as first_dashboard_open_at,
    coalesce((detail ->> 'isNewUser')::boolean, false) as is_new_user,
    coalesce((detail ->> 'mealsLoggedToday')::integer, 0) as meals_logged_today
  from public.analytics_events
  where event_name = 'dashboard_open'
  order by user_id, created_at
),
activation as (
  select *
  from public.beta_user_activation
)
select
  count(*) filter (where first_dashboard.is_new_user) as empty_state_users,
  count(*) filter (
    where first_dashboard.is_new_user
      and activation.first_meal_logged_at is not null
      and activation.first_meal_logged_at > first_dashboard.first_dashboard_open_at
  ) as recovered_to_first_meal_users,
  round(
    100.0 * count(*) filter (
      where first_dashboard.is_new_user
        and activation.first_meal_logged_at is not null
        and activation.first_meal_logged_at > first_dashboard.first_dashboard_open_at
    )
    / nullif(count(*) filter (where first_dashboard.is_new_user), 0),
    1
  ) as recovered_to_first_meal_pct
from first_dashboard
join activation using (user_id);

revoke all on public.beta_user_activation from anon, authenticated;
revoke all on public.beta_funnel_summary from anon, authenticated;
revoke all on public.beta_retention_summary from anon, authenticated;
revoke all on public.beta_prompt_dropoff from anon, authenticated;
revoke all on public.beta_empty_state_recovery from anon, authenticated;

grant select on public.beta_user_activation to service_role;
grant select on public.beta_funnel_summary to service_role;
grant select on public.beta_retention_summary to service_role;
grant select on public.beta_prompt_dropoff to service_role;
grant select on public.beta_empty_state_recovery to service_role;

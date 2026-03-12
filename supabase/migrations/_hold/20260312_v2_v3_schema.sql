-- CalGPT V2/V3 SQL schema
-- Run this in Supabase SQL editor before deploying V2/V3.

create extension if not exists pgcrypto;

create table if not exists public.nutrition_goals (
  user_id uuid primary key,
  calories integer not null default 2000,
  protein integer not null default 150,
  carbs integer not null default 200,
  fats integer not null default 65,
  goal_weight numeric(6,2),
  start_weight numeric(6,2),
  target_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key,
  unit_weight text not null default 'kg' check (unit_weight in ('kg', 'lb')),
  unit_energy text not null default 'kcal' check (unit_energy in ('kcal', 'kj')),
  language text not null default 'en',
  reminder_enabled boolean not null default false,
  reminder_time text not null default '20:00',
  theme_preset text not null default 'midnight',
  streak_badge_notifications boolean not null default true,
  height_cm numeric(5,2) not null default 170,
  updated_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  legacy_meal_id text,
  meal_name text not null,
  calories integer not null default 0,
  protein integer not null default 0,
  carbs integer not null default 0,
  fats integer not null default 0,
  logged_date date not null default current_date,
  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists meals_user_date_idx on public.meals(user_id, logged_date desc);

create table if not exists public.daily_totals (
  user_id uuid not null,
  entry_date date not null,
  total_calories integer not null default 0,
  total_protein integer not null default 0,
  total_carbs integer not null default 0,
  total_fats integer not null default 0,
  meal_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  entry_date date not null,
  weight numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index if not exists weight_entries_user_date_idx on public.weight_entries(user_id, entry_date desc);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  image_url text not null,
  note text,
  captured_at timestamptz not null default now()
);

create index if not exists progress_photos_user_captured_idx on public.progress_photos(user_id, captured_at desc);

create table if not exists public.streak_events (
  user_id uuid not null,
  entry_date date not null,
  meals_logged integer not null default 0,
  met_goal boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

create table if not exists public.badge_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  badge_code text not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_code)
);

alter table public.nutrition_goals enable row level security;
alter table public.user_preferences enable row level security;
alter table public.meals enable row level security;
alter table public.daily_totals enable row level security;
alter table public.weight_entries enable row level security;
alter table public.progress_photos enable row level security;
alter table public.streak_events enable row level security;
alter table public.badge_events enable row level security;

-- RLS policies (drop+create so reruns stay idempotent)
drop policy if exists nutrition_goals_rw on public.nutrition_goals;
create policy nutrition_goals_rw on public.nutrition_goals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_rw on public.user_preferences;
create policy user_preferences_rw on public.user_preferences
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists meals_rw on public.meals;
create policy meals_rw on public.meals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists daily_totals_rw on public.daily_totals;
create policy daily_totals_rw on public.daily_totals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists weight_entries_rw on public.weight_entries;
create policy weight_entries_rw on public.weight_entries
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists progress_photos_rw on public.progress_photos;
create policy progress_photos_rw on public.progress_photos
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists streak_events_rw on public.streak_events;
create policy streak_events_rw on public.streak_events
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists badge_events_rw on public.badge_events;
create policy badge_events_rw on public.badge_events
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

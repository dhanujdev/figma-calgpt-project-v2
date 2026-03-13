-- Rollback SQL:
-- drop policy if exists analytics_events_read_own on public.analytics_events;
-- drop table if exists public.analytics_events;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_name text not null,
  tool_name text not null,
  page text,
  source text not null default 'direct',
  widget_version text,
  failure_class text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events(user_id, created_at desc);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events(event_name, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists analytics_events_read_own on public.analytics_events;
create policy analytics_events_read_own on public.analytics_events
  using (auth.uid() = user_id);

-- Rollback SQL:
-- drop policy if exists agent_notes_rw on public.agent_notes;
-- drop table if exists public.agent_notes;

create table if not exists public.agent_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  note_key text not null,
  note_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, note_key)
);

create index if not exists agent_notes_user_updated_idx
  on public.agent_notes(user_id, updated_at desc);

alter table public.agent_notes enable row level security;

drop policy if exists agent_notes_rw on public.agent_notes;
create policy agent_notes_rw on public.agent_notes
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

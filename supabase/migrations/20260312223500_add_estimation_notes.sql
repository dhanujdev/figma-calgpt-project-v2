-- Rollback SQL:
-- alter table public.meals drop column if exists estimation_notes;

alter table public.meals
  add column if not exists estimation_notes text;

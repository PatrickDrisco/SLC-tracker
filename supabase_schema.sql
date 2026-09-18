-- ============================================================================
-- MCx Dashboard — Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- One row holds the entire dashboard (people, weeks, tasks, contacts, training).
-- This matches the "mostly one editor, others view/occasionally edit" model.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Turn on Row-Level Security so only signed-in people can touch the data.
alter table public.app_state enable row level security;

-- Any signed-in (authenticated) user may READ the board.
drop policy if exists "read for authenticated" on public.app_state;
create policy "read for authenticated"
  on public.app_state for select
  to authenticated
  using (true);

-- Any signed-in user may create the initial row.
drop policy if exists "insert for authenticated" on public.app_state;
create policy "insert for authenticated"
  on public.app_state for insert
  to authenticated
  with check (true);

-- Any signed-in user may UPDATE the board (leads occasionally edit).
-- To make some people view-only later, see the note at the bottom.
drop policy if exists "update for authenticated" on public.app_state;
create policy "update for authenticated"
  on public.app_state for update
  to authenticated
  using (true)
  with check (true);

-- Enable realtime so open sessions receive live updates.
alter publication supabase_realtime add table public.app_state;

-- ============================================================================
-- OPTIONAL — make it view-only for everyone except you (edit later):
--
--   1. Add an "editors" table of allowed emails:
--        create table public.editors (email text primary key);
--        insert into public.editors (email) values ('you@company.com');
--        alter table public.editors enable row level security;
--        create policy "read editors" on public.editors for select to authenticated using (true);
--
--   2. Replace the update policy above with one that checks membership:
--        drop policy "update for authenticated" on public.app_state;
--        create policy "update for editors"
--          on public.app_state for update to authenticated
--          using (exists (select 1 from public.editors e where e.email = auth.jwt() ->> 'email'))
--          with check (true);
-- ============================================================================

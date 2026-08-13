-- One row per user, holding their whole StudySprint state (assignments, tests,
-- sessions, profile, streak, analyses, quiz) as a single JSON document. This
-- mirrors the shape the client already used for its localStorage cache, so the
-- client can migrate existing local data up on first sync with no reshaping.
create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

create policy "Users can view their own data"
  on public.app_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.app_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

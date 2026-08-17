-- StudySprint Pro subscription system.
--
-- Three tables, all owned entirely by the server side (Edge Functions using the service-role
-- key). Authenticated users can only ever SELECT their own rows here — there is deliberately no
-- insert/update/delete policy for the `authenticated` role on `subscriptions` or `ai_usage`, so a
-- user cannot become Pro or reset their usage by calling the Supabase client directly, no matter
-- what they do in devtools. Only the Stripe webhook and the checkout/usage-tracking Edge Functions
-- (which run with the service-role key and therefore bypass RLS) may write to these tables.

-- One row per user: the durable, server-tracked source of truth for plan/trial/billing state.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none', -- none | trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid
  plan text not null default 'free',   -- free | pro — derived from status, kept in sync by the webhook
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- One row per user per calendar month, holding the AI usage counters that gate the free plan.
-- Incremented exclusively through increment_ai_usage() below so the check-then-increment is
-- atomic and race-safe, never via a plain client-side update.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  organizer_count int not null default 0,
  syllabus_count int not null default 0,
  analyzer_count int not null default 0,
  quiz_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

alter table public.ai_usage enable row level security;

create policy "Users can view their own AI usage"
  on public.ai_usage for select
  using (auth.uid() = user_id);

-- Records processed Stripe webhook event ids so retried/duplicate deliveries never get applied
-- twice. Not exposed to any client role at all — only the service role can reach it.
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- Atomically checks the current month's count for one AI feature against a limit and increments
-- it only if under the limit, in a single statement, so two concurrent requests can never both
-- squeak through. `security definer` lets it write ai_usage on behalf of the caller; execute is
-- restricted to service_role so only trusted Edge Function code can call it.
create or replace function public.increment_ai_usage(p_user_id uuid, p_feature text, p_limit int)
returns table(allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  col text;
  period date := date_trunc('month', now())::date;
  new_count int;
begin
  col := case p_feature
    when 'organizer' then 'organizer_count'
    when 'syllabus' then 'syllabus_count'
    when 'analyzer' then 'analyzer_count'
    when 'quiz' then 'quiz_count'
    else null
  end;
  if col is null then
    raise exception 'invalid AI usage feature: %', p_feature;
  end if;

  insert into public.ai_usage (user_id, period_start)
  values (p_user_id, period)
  on conflict (user_id, period_start) do nothing;

  execute format(
    'update public.ai_usage set %1$I = %1$I + 1, updated_at = now()
     where user_id = $1 and period_start = $2 and %1$I < $3
     returning %1$I',
    col
  ) into new_count using p_user_id, period, p_limit;

  if new_count is null then
    execute format('select %1$I from public.ai_usage where user_id = $1 and period_start = $2', col)
      into new_count using p_user_id, period;
    return query select false, coalesce(new_count, 0);
  else
    return query select true, new_count;
  end if;
end;
$$;

revoke all on function public.increment_ai_usage(uuid, text, int) from public;
revoke all on function public.increment_ai_usage(uuid, text, int) from anon;
revoke all on function public.increment_ai_usage(uuid, text, int) from authenticated;
grant execute on function public.increment_ai_usage(uuid, text, int) to service_role;

-- ─── Run this entire file in Supabase → SQL Editor ───────────────────────
-- Safe to run multiple times (all statements are idempotent)

-- ── Subscriptions table ────────────────────────────────────────────────────
-- Supabase Auth manages the auth.users table automatically.
create table if not exists public.subscriptions (
  id                   uuid default gen_random_uuid() primary key,
  user_id              uuid references auth.users(id) on delete cascade unique,
  email                text not null unique,
  ls_customer_id       text,                          -- Lemon Squeezy customer ID
  ls_subscription_id   text unique,                   -- Lemon Squeezy subscription ID
  status               text default 'inactive',       -- active | inactive | cancelled | paused
  current_period_end   timestamptz,                   -- when current billing period ends
  last_ip              text,                          -- for concurrent session detection
  last_seen            timestamptz,                   -- last API call timestamp
  api_calls_today      integer default 0,
  api_calls_reset_at   timestamptz default now(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ── Row-level security ─────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

-- Users can only read their own subscription row
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'subscriptions'
      and policyname = 'Users read own subscription'
  ) then
    create policy "Users read own subscription"
      on public.subscriptions for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Admins (service role key) bypass RLS automatically — no extra policy needed.

-- ── Auto-update updated_at ─────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.handle_updated_at();

-- ── Performance indexes ────────────────────────────────────────────────────
create index if not exists idx_subscriptions_email      on public.subscriptions(email);
create index if not exists idx_subscriptions_ls_sub_id  on public.subscriptions(ls_subscription_id);
create index if not exists idx_subscriptions_user_id    on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status     on public.subscriptions(status);

-- ── Helper function: efficient email → user_id lookup ─────────────────────
-- Used by the webhook handler instead of paginating through all auth users.
-- SECURITY DEFINER means it runs with the postgres superuser privileges,
-- which is needed to read auth.users. Only callable via service role key.
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
as $$
  select id
  from auth.users
  where email = p_email
  limit 1;
$$;

-- Revoke from public, grant only to service role (runs via server-side functions)
revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- ─── Run this entire file in Supabase → SQL Editor ───────────────────────

-- Subscriptions table (Supabase Auth handles the users table automatically)
create table if not exists public.subscriptions (
  id                   uuid default gen_random_uuid() primary key,
  user_id              uuid references auth.users(id) on delete cascade unique,
  email                text not null unique,
  ls_customer_id       text,           -- Lemon Squeezy customer ID
  ls_subscription_id   text unique,    -- Lemon Squeezy subscription ID
  status               text default 'inactive',  -- active | inactive | cancelled | paused
  current_period_end   timestamptz,    -- when current billing period ends
  last_ip              text,           -- for concurrent session detection
  last_seen            timestamptz,    -- last API call timestamp
  api_calls_today      integer default 0,
  api_calls_reset_at   timestamptz default now(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- Row-level security: users can only read their own row
alter table public.subscriptions enable row level security;

create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Admins (service role) can do everything — no separate policy needed
-- because service role bypasses RLS by default

-- Auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.handle_updated_at();

-- Index for fast lookup by email (used in webhook handler)
create index if not exists idx_subscriptions_email on public.subscriptions(email);
create index if not exists idx_subscriptions_ls_sub_id on public.subscriptions(ls_subscription_id);

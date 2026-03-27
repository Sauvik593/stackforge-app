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

-- ═══════════════════════════════════════════════════════════════════════════
-- AGENT / RAG SYSTEM — Stack Templates with pgvector semantic search
-- Enables: "retrieve similar templates → inject as context → AI generates"
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pgvector extension (idempotent — safe to re-run)
create extension if not exists vector;

-- ── Stack Templates table ──────────────────────────────────────────────────
create table if not exists public.stack_templates (
  id             uuid        default gen_random_uuid() primary key,
  name           text        not null,
  description    text        not null,    -- short sentence embedded for similarity search
  cloud          text        not null,    -- 'aws' | 'azure' | 'gcp'
  iac_tool       text        not null,    -- 'terraform' | 'terragrunt' | 'pulumi' | etc.
  deploy_target  text,                   -- 'ec2' | 'eks' | 'ecs' | 'gke' | null
  pipeline       text,                   -- 'github' | 'gitlab' | null
  config_tool    text,                   -- 'ansible' | 'puppet' | null
  category       text        not null,   -- 'iac' | 'pipeline' | 'config' | 'security' | 'observability'
  content        text        not null,   -- full code in # File: ... ```lang``` format
  tags           text[]      default '{}',
  usage_count    integer     default 0,  -- how many times retrieved — for popularity ranking
  quality_score  float       default 1.0,-- admin-adjustable quality weight (0.0–2.0)
  embedding      vector(768),            -- text-embedding-004 produces 768-dim vectors
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ── RLS: authenticated users read; service role writes ────────────────────
alter table public.stack_templates enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'stack_templates'
      and policyname = 'Authenticated users can read templates'
  ) then
    create policy "Authenticated users can read templates"
      on public.stack_templates for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- ── Auto-update updated_at ────────────────────────────────────────────────
drop trigger if exists stack_templates_updated_at on public.stack_templates;
create trigger stack_templates_updated_at
  before update on public.stack_templates
  for each row execute procedure public.handle_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────
create index if not exists idx_stack_templates_cloud
  on public.stack_templates(cloud);
create index if not exists idx_stack_templates_category
  on public.stack_templates(category);
create index if not exists idx_stack_templates_cloud_iac
  on public.stack_templates(cloud, iac_tool);

-- NOTE: After seeding rows, create the vector index for fast ANN search:
-- create index stack_templates_embedding_idx
--   on public.stack_templates
--   using ivfflat (embedding vector_cosine_ops) with (lists = 20);
-- (Run this manually in Supabase SQL editor after first seed)

-- ── Semantic similarity search RPC ────────────────────────────────────────
-- Called from api/claude.js before every AI generation to retrieve context.
-- Uses cosine distance (<=>); returns rows ordered by highest similarity first.
create or replace function public.match_stack_templates(
  query_embedding vector(768),
  match_count     int     default 3,
  filter_cloud    text    default null,
  filter_category text    default null,
  min_similarity  float   default 0.5
)
returns table (
  id          uuid,
  name        text,
  description text,
  content     text,
  category    text,
  similarity  float
)
language sql stable
as $$
  select
    id,
    name,
    description,
    content,
    category,
    (1 - (embedding <=> query_embedding)) * quality_score as similarity
  from public.stack_templates
  where
    (filter_cloud    is null or cloud    = filter_cloud)
    and (filter_category is null or category = filter_category)
    and embedding is not null
    and (1 - (embedding <=> query_embedding)) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Bump usage count when a template is retrieved (called from api/claude.js)
create or replace function public.increment_template_usage(template_id uuid)
returns void language sql as $$
  update public.stack_templates
  set usage_count = usage_count + 1
  where id = template_id;
$$;

-- Content workflow foundation for Wesh Alsalfah.
-- Review and apply only after MFA/AAL2 verification; this file is NOT applied to production.
begin;

create table if not exists public.trends (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  summary text not null default '',
  region text not null default 'saudi'
    check (region in ('saudi','gulf','arab_world','global')),
  platform text not null default 'other'
    check (platform in ('x','tiktok','instagram','youtube','search','other')),
  source_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','checking','verified','debunked')),
  status text not null default 'pending'
    check (status in ('pending','draft','active','paused','expired','rejected')),
  starts_at timestamptz,
  ends_at timestamptz,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.article_trends (
  article_id uuid not null references public.articles(id) on delete cascade,
  trend_id uuid not null references public.trends(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, trend_id)
);

create table if not exists public.content_activity (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null check (entity_type in ('article','trend')),
  entity_id uuid not null,
  action text not null check (action in ('created','updated','submitted','published','rejected','paused','deleted','linked')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists articles_status_created_idx on public.articles(status, created_at desc);
create index if not exists trends_status_created_idx on public.trends(status, created_at desc);
create index if not exists article_trends_trend_idx on public.article_trends(trend_id);
create index if not exists content_activity_entity_idx on public.content_activity(entity_type, entity_id, created_at desc);

alter table public.trends enable row level security;
alter table public.article_trends enable row level security;
alter table public.content_activity enable row level security;

revoke all on public.trends, public.article_trends, public.content_activity from public, anon, authenticated;
grant select on public.trends, public.article_trends to anon, authenticated;
grant insert, update, delete on public.trends, public.article_trends to authenticated;
grant select on public.content_activity to authenticated;
grant usage, select on sequence public.content_activity_id_seq to authenticated;

drop policy if exists "Public can read active trends" on public.trends;
create policy "Public can read active trends" on public.trends
for select to anon, authenticated using (status = 'active' and verification_status = 'verified');

drop policy if exists "Staff read trends" on public.trends;
create policy "Staff read trends" on public.trends
for select to authenticated
using ((select private.current_user_role()) in ('admin','editor'));

drop policy if exists "Editors create pending trends" on public.trends;
create policy "Editors create pending trends" on public.trends
for insert to authenticated
with check (
  (select private.current_user_role()) in ('admin','editor')
  and created_by = (select auth.uid())
  and status in ('pending','draft')
);

drop policy if exists "Editors update non-active trends" on public.trends;
create policy "Editors update non-active trends" on public.trends
for update to authenticated
using ((select private.current_user_role()) in ('admin','editor'))
with check (
  (select private.current_user_role()) = 'admin'
  or status in ('pending','draft','rejected')
);

drop policy if exists "Admins manage trends" on public.trends;
create policy "Admins manage trends" on public.trends
for all to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Staff read article trend links" on public.article_trends;
create policy "Staff read article trend links" on public.article_trends
for select to authenticated
using ((select private.current_user_role()) in ('admin','editor'));

drop policy if exists "Public read links for public content" on public.article_trends;
create policy "Public read links for public content" on public.article_trends
for select to anon, authenticated
using (
  exists (select 1 from public.articles a where a.id = article_id and a.status = 'published')
  and exists (select 1 from public.trends t where t.id = trend_id and t.status = 'active' and t.verification_status = 'verified')
);

drop policy if exists "Staff manage article trend links" on public.article_trends;
create policy "Staff manage article trend links" on public.article_trends
for all to authenticated
using ((select private.current_user_role()) in ('admin','editor'))
with check ((select private.current_user_role()) in ('admin','editor'));

drop policy if exists "Admins read content activity" on public.content_activity;
create policy "Admins read content activity" on public.content_activity
for select to authenticated
using ((select private.current_user_role()) = 'admin');

-- Activity is append-only for authenticated staff; no UPDATE/DELETE grants or policies.
drop policy if exists "Staff append content activity" on public.content_activity;
create policy "Staff append content activity" on public.content_activity
for insert to authenticated
with check ((select private.current_user_role()) in ('admin','editor') and actor_id = (select auth.uid()));

commit;

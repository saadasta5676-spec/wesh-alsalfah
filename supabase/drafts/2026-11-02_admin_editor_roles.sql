-- DRAFT ONLY. Review this file and the live schema before applying it in Supabase.
-- Creates database-enforced admin/editor roles for articles.
-- Admin: read/insert/update/delete articles and manage profiles.
-- Editor: read/insert/update articles; cannot delete articles or manage profiles.
-- This file is NOT applied by this commit.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The function reads only the caller's own role. SECURITY DEFINER avoids
-- recursive evaluation of profiles RLS; all object names are schema-qualified.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- Explicit table grants are still constrained by the RLS policies below.
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admins manage profiles" on public.profiles;
drop policy if exists "Profiles readable by owner or admin" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;

create policy "Profiles readable by owner or admin"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_role()) = 'admin'
);

create policy "Admins can manage profiles"
on public.profiles for all
to authenticated
using ((select public.current_user_role()) = 'admin')
with check ((select public.current_user_role()) = 'admin');

-- Bootstrap the already-confirmed owner account as the first admin.
-- The migration aborts unless exactly one Auth user matches this email.
do $bootstrap$
declare
  v_user_id uuid;
  v_count integer;
begin
  select count(*) into v_count
  from auth.users
  where lower(email) = lower('saadasta.5676@gmail.com');

  if v_count <> 1 then
    raise exception 'Expected exactly one Auth user for the configured admin email; found %', v_count;
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower('saadasta.5676@gmail.com');

  insert into public.profiles (id, role)
  values (v_user_id, 'admin')
  on conflict (id) do update
    set role = 'admin', updated_at = now();
end
$bootstrap$;

-- Remove the previously audited policy that allowed every authenticated
-- account to manage every article.
drop policy if exists "Authenticated editors manage articles" on public.articles;

drop policy if exists "Staff can read all articles" on public.articles;
create policy "Staff can read all articles"
on public.articles for select
to authenticated
using ((select public.current_user_role()) in ('admin', 'editor'));

drop policy if exists "Staff can insert articles" on public.articles;
create policy "Staff can insert articles"
on public.articles for insert
to authenticated
with check ((select public.current_user_role()) in ('admin', 'editor'));

drop policy if exists "Staff can update articles" on public.articles;
create policy "Staff can update articles"
on public.articles for update
to authenticated
using ((select public.current_user_role()) in ('admin', 'editor'))
with check ((select public.current_user_role()) in ('admin', 'editor'));

drop policy if exists "Admins can delete articles" on public.articles;
create policy "Admins can delete articles"
on public.articles for delete
to authenticated
using ((select public.current_user_role()) = 'admin');

commit;

-- Read-only verification after a separately approved application:
-- select public.current_user_role();
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename in ('articles','profiles')
-- order by tablename, policyname;

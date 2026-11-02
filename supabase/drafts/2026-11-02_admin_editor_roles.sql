-- DRAFT ONLY. NOT EXECUTED.
-- Role model for public.articles:
--   admin: select/insert/update/delete articles; manage profiles
--   editor: select/insert/update articles; cannot delete or manage profiles
--
-- IMPORTANT:
-- 1) Review the live pg_policies output before applying.
-- 2) This migration aborts if it finds an unexpected articles policy.
-- 3) It intentionally does NOT bootstrap an admin by email. Provision the first
--    admin separately using the verified auth.users UUID in a private,
--    one-time operation after this migration is reviewed and approved.
-- 4) Confirm the function owner is a trusted database role (normally postgres).

begin;

-- Fail closed: only the previously identified broad policy and public
-- published-only SELECT policies are accepted. Unknown policies must be
-- reviewed manually rather than silently combined with these role policies.
do $preflight$
declare
  p record;
begin
  for p in
    select policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = 'articles'
  loop
    if p.policyname = 'Authenticated editors manage articles'
       and p.cmd = 'ALL' then
      continue;
    end if;

    if p.cmd = 'SELECT'
       and lower(coalesce(p.qual, '')) like '%published%' then
      continue;
    end if;

    raise exception
      'Unexpected articles RLS policy "%" (cmd=%). Review the live policy before applying this migration.',
      p.policyname, p.cmd;
  end loop;
end
$preflight$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER avoids recursive profiles RLS checks. Keep the function
-- owned by a trusted role; search_path is empty and objects are qualified.
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
revoke all on function public.current_user_role() from anon;
grant execute on function public.current_user_role() to authenticated;

-- Table privileges do not replace RLS; both layers must allow an operation.
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

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

-- No self-service role assignment is granted. Provision the first admin
-- separately using a verified Auth UUID; do not commit personal identifiers.

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

-- After a separately approved application, verify:
-- select policyname, permissive, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename in ('articles', 'profiles')
-- order by tablename, policyname;
-- Also inspect function ownership and table grants, then test anon/editor/admin
-- with separate sessions before enabling the admin UI.

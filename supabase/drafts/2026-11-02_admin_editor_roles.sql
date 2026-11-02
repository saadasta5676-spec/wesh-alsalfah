-- DRAFT ONLY. NOT EXECUTED.
-- Role model for public.articles:
--   admin: select/insert/update/delete articles; manage profiles
--   editor: select/insert/update articles; cannot delete or manage profiles
--
-- IMPORTANT:
-- 1) This preflight is pinned to the exact live articles policies observed on
--    2026-11-02. If production changes, review pg_policies and update this
--    allow-list deliberately; do not loosen it to accept unknown policies.
-- 2) The live result showed exactly two PERMISSIVE policies:
--      Authenticated editors manage articles:
--        roles={authenticated}, cmd=ALL, qual=true, with_check=true
--      Public can read published articles:
--        roles={public}, cmd=SELECT,
--        qual=(status = 'published'::text), with_check=NULL
-- 3) No profiles policy rows were returned. The preflight also requires that
--    public.profiles does not already exist, so an existing object is reviewed
--    rather than silently reused.
-- 4) This migration does NOT bootstrap an admin by email. Provision the first
--    admin separately using a verified auth.users UUID in a private,
--    one-time operation after this migration is reviewed and approved.
-- 5) After application, confirm current_user_role() is owned by a trusted
--    database role (normally postgres), inspect grants, and test each role.

begin;

-- Fail closed against the exact production policy state observed.
-- Normalize whitespace/case only; policy names, permissiveness, roles,
-- commands, expressions, and NULL-ness must otherwise match exactly.
do $preflight$
declare
  p record;
  saw_authenticated_all boolean := false;
  saw_public_published_select boolean := false;
begin
  if to_regclass('public.profiles') is not null then
    raise exception
      'public.profiles already exists. Review its columns, grants, RLS state, and policies before applying this draft.';
  end if;

  for p in
    select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = 'articles'
  loop
    if p.policyname = 'Authenticated editors manage articles'
       and p.permissive = 'PERMISSIVE'
       and p.roles = array['authenticated']::name[]
       and p.cmd = 'ALL'
       and lower(regexp_replace(btrim(coalesce(p.qual, '')), '\s+', '', 'g')) = 'true'
       and lower(regexp_replace(btrim(coalesce(p.with_check, '')), '\s+', '', 'g')) = 'true' then
      if saw_authenticated_all then
        raise exception 'Duplicate matching policy row: Authenticated editors manage articles.';
      end if;
      saw_authenticated_all := true;
      continue;
    end if;

    if p.policyname = 'Public can read published articles'
       and p.permissive = 'PERMISSIVE'
       and p.roles = array['public']::name[]
       and p.cmd = 'SELECT'
       and lower(regexp_replace(btrim(coalesce(p.qual, '')), '\s+', '', 'g')) = '(status=''published''::text)'
       and p.with_check is null then
      if saw_public_published_select then
        raise exception 'Duplicate matching policy row: Public can read published articles.';
      end if;
      saw_public_published_select := true;
      continue;
    end if;

    raise exception
      'Unexpected articles RLS policy "%" (permissive=%, roles=%, cmd=%, qual=%, with_check=%). Review live policy before applying.',
      p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check;
  end loop;

  if not saw_authenticated_all then
    raise exception 'Expected live policy not found: Authenticated editors manage articles.';
  end if;

  if not saw_public_published_select then
    raise exception 'Expected live policy not found: Public can read published articles.';
  end if;
end
$preflight$;

create table public.profiles (
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

drop policy "Authenticated editors manage articles" on public.articles;

create policy "Staff can read all articles"
on public.articles for select
to authenticated
using ((select public.current_user_role()) in ('admin', 'editor'));

create policy "Staff can insert articles"
on public.articles for insert
to authenticated
with check ((select public.current_user_role()) in ('admin', 'editor'));

create policy "Staff can update articles"
on public.articles for update
to authenticated
using ((select public.current_user_role()) in ('admin', 'editor'))
with check ((select public.current_user_role()) in ('admin', 'editor'));

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
--
-- Also inspect:
-- * function owner for public.current_user_role() (must be trusted);
-- * table privileges on articles and profiles (RLS does not replace GRANT);
-- * anon/editor/admin behavior in separate sessions before enabling admin UI.

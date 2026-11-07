-- DRAFT ONLY. NOT EXECUTED.
-- Role model for public.articles:
--   admin: select/insert/update/delete articles; manage profiles
--   editor: select/insert/update articles; cannot delete or manage profiles
--
-- IMPORTANT:
-- 1) This preflight is pinned to the exact live articles policies and grants
--    observed on 2026-11-02. If production changes, review live catalogs and
--    update the allow-lists deliberately; unknown state must stop the migration.
-- 2) Live articles policies observed:
--      Authenticated editors manage articles:
--        PERMISSIVE, roles={authenticated}, cmd=ALL, qual=true, with_check=true
--      Public can read published articles:
--        PERMISSIVE, roles={public}, cmd=SELECT,
--        qual=(status = 'published'::text), with_check=NULL
-- 3) Live articles grants observed for both anon and authenticated:
--      DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--    All were non-grantable. postgres and service_role grants are intentionally
--    left unchanged by this draft.
-- 4) No profiles policy rows or profiles table were returned. This draft stops
--    if public.profiles already exists rather than silently reusing it.
-- 5) This migration does NOT bootstrap an admin by email. Provision the first
--    admin separately using a verified auth.users UUID in a private,
--    one-time operation after this migration is reviewed and approved.
-- 6) After application, verify function ownership/grants and test each role.

begin;

-- Fail closed against the exact production policy state observed.
do $preflight_policies$
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
$preflight_policies$;

-- Pin the table-level grants for anon/authenticated to the exact live snapshot.
-- This detects drift before any REVOKE/GRANT runs. It intentionally does not
-- modify postgres or service_role ACLs.
do $preflight_grants$
declare
  r record;
  expected_privileges text[] := array[
    'DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
  ];
begin
  for r in
    select grantee, array_agg(privilege_type order by privilege_type) as privileges,
           bool_or(is_grantable = 'YES') as has_grant_option
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'articles'
      and grantee in ('anon', 'authenticated')
    group by grantee
  loop
    if r.privileges is distinct from expected_privileges
       or coalesce(r.has_grant_option, false) then
      raise exception
        'Unexpected articles grants for %: privileges=%, grant_option=%. Review live grants before applying.',
        r.grantee, r.privileges, r.has_grant_option;
    end if;
  end loop;

  if (
    select count(distinct grantee)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'articles'
      and grantee in ('anon', 'authenticated')
  ) <> 2 then
    raise exception 'Expected grant rows for both anon and authenticated were not found.';
  end if;
end
$preflight_grants$;

-- Column-level grants were not included in the supplied live audit.
-- Stop if any exist for PUBLIC/anon/authenticated instead of assuming the
-- table-level snapshot captures them.
do $preflight_column_grants$
declare
  c record;
begin
  select grantee, table_name, column_name, privilege_type
    into c
  from information_schema.role_column_grants
  where table_schema = 'public'
    and table_name = 'articles'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  limit 1;

  if found then
    raise exception
      'Unexpected column-level grant on public.articles: grantee=%, column=%, privilege=%. Review column ACLs before applying.',
      c.grantee, c.column_name, c.privilege_type;
  end if;
end
$preflight_column_grants$;

-- Least privilege for the public-facing article table.
-- anon: read only; the existing SELECT RLS policy limits this to published rows.
-- authenticated: read/write operations; RLS below limits DELETE to admins.
-- TRUNCATE, TRIGGER, REFERENCES and grant options are not needed by either role.
revoke all privileges on table public.articles from anon, authenticated;
grant select on table public.articles to anon;
grant select, insert, update, delete on table public.articles to authenticated;

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
as $role_fn$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid());
$role_fn$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_role() from anon;
revoke all on function public.current_user_role() from authenticated;
grant execute on function public.current_user_role() to authenticated;

-- SECURITY DEFINER functions run with their owner's privileges. Use the
-- trusted Supabase database owner explicitly; abort if ownership cannot be set.
alter function public.current_user_role() owner to postgres;

-- Reset the function ACL rather than relying on inherited/default privileges.
revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_role() from anon;
revoke all on function public.current_user_role() from authenticated;
grant execute on function public.current_user_role() to authenticated;

do $function_security_check$
declare
  f record;
begin
  select
    pg_get_userbyid(p.proowner) as owner_name,
    p.prosecdef as security_definer,
    p.proconfig as function_config
  into f
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'current_user_role'
    and pg_get_function_identity_arguments(p.oid) = '';

  if not found
     or f.owner_name <> 'postgres'
     or f.security_definer is distinct from true
     or not coalesce('search_path=""' = any(f.function_config), false) then
    raise exception
      'current_user_role() security check failed: owner=%, security_definer=%, config=%',
      f.owner_name, f.security_definer, f.function_config;
  end if;
end
$function_security_check$;

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
-- Verify table grants (anon should have SELECT only; authenticated should have
-- SELECT/INSERT/UPDATE/DELETE; neither should have TRUNCATE/TRIGGER/REFERENCES).
-- Inspect current_user_role() owner, SECURITY DEFINER, search_path and EXECUTE ACL.
-- Test anon/editor/admin in separate sessions before enabling the admin UI.

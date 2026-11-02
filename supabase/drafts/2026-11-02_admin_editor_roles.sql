-- DRAFT ONLY: review before running in production.
-- Roles: admin (full editorial + role management), editor (articles, no deletes).
-- This migration intentionally does NOT create an admin automatically.
-- Replace the email in the bootstrap section with the exact email of the existing,
-- trusted Supabase Auth account before running. Do not share passwords or service keys.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

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

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles"
on public.profiles for all
to authenticated
using ((select public.current_user_role()) = 'admin')
with check ((select public.current_user_role()) = 'admin');

-- Bootstrap exactly one existing account as admin.
-- IMPORTANT: replace the placeholder with the trusted account email.
do $bootstrap$
declare
  v_user_id uuid;
  v_count integer;
begin
  select count(*), min(id::text)::uuid
    into v_count, v_user_id
  from auth.users
  where lower(email) = lower('saadasta.5676@gmail.com');

  if v_count <> 1 then
    raise exception 'Expected exactly one Auth user for the supplied email; found %', v_count;
  end if;

  insert into public.profiles (id, role)
  values (v_user_id, 'admin')
  on conflict (id) do update
    set role = 'admin', updated_at = now();
end
$bootstrap$;

-- Remove the previous broad policy that granted every signed-in account all actions.
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

-- After running, verify:
-- select public.current_user_role();
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname='public' and tablename in ('articles','profiles');

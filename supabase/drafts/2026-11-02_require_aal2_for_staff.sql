-- DRAFT ONLY. Do not execute until reviewed with the application change.
-- Require AAL2 for all authenticated article operations.
-- Public/anon access continues to be governed by the existing published-only
-- SELECT policy; this restrictive policy targets authenticated staff only.
-- Profiles intentionally remain accessible at AAL1 so a staff member can
-- discover their role and complete first-time TOTP enrollment.
begin;
drop policy if exists "Staff require AAL2 for articles" on public.articles;
create policy "Staff require AAL2 for articles"
on public.articles
as restrictive
for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');
commit;
-- Verify after a separately approved deployment:
-- select policyname, permissive, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename='articles'
--   and policyname='Staff require AAL2 for articles';
-- Test anon published reads, staff AAL1 denial, and staff AAL2 role-specific
-- access (editor cannot delete; admin can delete).

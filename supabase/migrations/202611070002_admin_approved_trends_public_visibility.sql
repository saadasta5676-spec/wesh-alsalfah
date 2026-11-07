-- Allow public visibility for trends explicitly published by an admin,
-- while keeping unverified editor submissions private.
-- Admin approval is recorded in the existing reviewed_by column.

create or replace function private.guard_trend_editor_write()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_role text;
begin
  v_role := private.current_user_role();

  if v_role = 'admin' then
    if NEW.status = 'active' then
      NEW.reviewed_by := (select auth.uid());
    end if;
    if TG_OP = 'UPDATE' then
      NEW.updated_at := now();
    end if;
    return NEW;
  end if;

  if v_role <> 'editor' then
    raise exception 'Insufficient role for trend changes' using errcode = '42501';
  end if;

  if TG_OP = 'INSERT' then
    if NEW.created_by is distinct from (select auth.uid())
       or NEW.status not in ('pending','draft')
       or NEW.verification_status <> 'unverified'
       or NEW.reviewed_by is not null
       or NEW.display_order <> 0 then
      raise exception 'Editors may only submit unverified pending/draft trends' using errcode = '42501';
    end if;
    return NEW;
  end if;

  if OLD.status not in ('pending','draft','rejected') then
    raise exception 'Editors cannot modify reviewed or active trends' using errcode = '42501';
  end if;

  if NEW.status is distinct from OLD.status
     or NEW.verification_status is distinct from OLD.verification_status
     or NEW.reviewed_by is distinct from OLD.reviewed_by
     or NEW.display_order is distinct from OLD.display_order
     or NEW.created_by is distinct from OLD.created_by
     or NEW.id is distinct from OLD.id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Only admins may change trend review fields' using errcode = '42501';
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$function$;

drop policy if exists "Public can read active trends" on public.trends;

create policy "Public can read admin-approved or verified active trends"
on public.trends
for select
to anon, authenticated
using (
  status = 'active'
  and (verification_status = 'verified' or reviewed_by is not null)
);

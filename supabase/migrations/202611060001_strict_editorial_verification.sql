-- Strict editorial verification gate. Apply only to an isolated preview Supabase project.
-- Existing published content is intentionally left unchanged.
alter table public.articles
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified','checking','verified','debunked')),
  add column if not exists verification_sources jsonb not null default '[]'::jsonb,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id);

alter table public.trends
  add column if not exists verification_sources jsonb not null default '[]'::jsonb,
  add column if not exists verified_at timestamptz;

create or replace function private.enforce_editorial_verification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_count integer;
begin
  if new.status = 'published' and (
    new.verification_status <> 'verified'
    or jsonb_typeof(new.verification_sources) <> 'array'
  ) then
    raise exception 'Publishing blocked: verification is incomplete';
  end if;

  if new.status = 'published' then
    select count(*) into source_count
    from jsonb_array_elements(new.verification_sources) s
    where s ? 'url' and s->>'url' ~ '^https?://' and coalesce(s->>'name','') <> '';

    if source_count < 1 then
      raise exception 'Publishing blocked: at least one documented primary source or two independent sources are required';
    end if;

    if source_count < 2 and not coalesce((new.verification_sources->0->>'is_primary')::boolean, false) then
      raise exception 'Publishing blocked: provide two independent sources or mark one documented primary source';
    end if;
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists articles_editorial_verification_gate on public.articles;
create trigger articles_editorial_verification_gate
before insert or update of status, verification_status, verification_sources
on public.articles
for each row execute function private.enforce_editorial_verification();

drop trigger if exists trends_editorial_verification_gate on public.trends;
create trigger trends_editorial_verification_gate
before insert or update of status, verification_status, verification_sources
on public.trends
for each row execute function private.enforce_editorial_verification();

-- Imported RSS and editor-created records remain unverified and unpublished by default.

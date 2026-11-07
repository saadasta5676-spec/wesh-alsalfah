-- Strict editorial verification gate for articles and trends.
-- Additive only: existing published rows are not rewritten.
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
  primary_count integer;
  should_block boolean := false;
begin
  if jsonb_typeof(new.verification_sources) <> 'array' then
    raise exception 'Verification sources must be a JSON array';
  end if;

  if tg_table_name = 'articles' then
    should_block := new.status = 'published';
  elsif tg_table_name = 'trends' then
    should_block := new.status = 'active';
  end if;

  if should_block then
    if new.verification_status <> 'verified' then
      raise exception 'Publishing blocked: editorial verification is incomplete';
    end if;

    select count(*),
           count(*) filter (where s->>'is_primary' = 'true')
      into source_count, primary_count
    from jsonb_array_elements(new.verification_sources) as s
    where coalesce(s->>'url','') ~ '^https?://'
      and coalesce(s->>'name','') <> '';

    if not (source_count >= 2 or (source_count = 1 and primary_count = 1)) then
      raise exception 'Publishing blocked: provide two documented independent sources or one documented primary source';
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

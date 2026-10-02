-- Audit columns on every table, stamped by one trigger.
-- The acting user comes from the transaction-local setting app.user_id (see asUser in lib/db.ts);
-- unset means a system write (worker, indexing) and records null.

create or replace function public.audit_stamp() returns trigger
language plpgsql set search_path = '' as $$
declare actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, actor);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := case when tg_op = 'INSERT' then new.created_by else actor end;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subjects', 'units', 'documents', 'pages', 'chunks', 'chat_logs', 'conversations'] loop
    execute format('alter table public.%I
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists created_by uuid references public.profiles on delete set null,
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists updated_by uuid references public.profiles on delete set null', t);
  end loop;
end $$;

-- One place for "who uploaded it". Runs before the triggers exist, so it is not stamped.
update public.documents set created_by = uploaded_by, updated_by = uploaded_by where uploaded_by is not null;
alter table public.documents drop column uploaded_by;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subjects', 'units', 'documents', 'pages', 'chunks', 'chat_logs', 'conversations'] loop
    execute format('create or replace trigger audit_stamp before insert or update on public.%I
      for each row execute function public.audit_stamp()', t);
  end loop;
end $$;

-- A new user signed themselves up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, created_by)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.id);
  return new;
end $$;

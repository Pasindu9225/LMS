-- created_by stays fixed on update, except that it may become null: on delete set null
-- (a creator's profile was deleted) runs as an UPDATE, and restoring old.created_by left
-- rows pointing at a profile that no longer exists.
create or replace function public.audit_stamp() returns trigger
language plpgsql set search_path = '' as $$
declare actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, actor);
  else
    new.created_at := old.created_at;
    new.created_by := case when new.created_by is null then null else old.created_by end;
  end if;
  new.updated_at := now();
  new.updated_by := case when tg_op = 'INSERT' then new.created_by else actor end;
  return new;
end $$;

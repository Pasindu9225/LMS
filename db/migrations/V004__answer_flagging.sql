-- A student can send a tutor answer to a teacher; an admin replies or dismisses.
-- flag_status null = not flagged. flagged_at/replied_at/replied_by are kept explicitly because the
-- audit columns only hold the last edit (seen-marking would overwrite them).
alter table chat_logs
  add column flag_status text check (flag_status in ('open', 'answered', 'dismissed')),
  add column flag_note text check (char_length(flag_note) <= 500),
  add column flagged_at timestamptz,
  add column reply text check (char_length(reply) <= 4000),
  add column replied_at timestamptz,
  add column replied_by uuid references profiles on delete set null,
  add column reply_seen boolean not null default false;
create index chat_logs_open_flags_idx on chat_logs (flagged_at) where flag_status = 'open';
create index chat_logs_unseen_reply_idx on chat_logs (conversation_id) where flag_status = 'answered' and not reply_seen;

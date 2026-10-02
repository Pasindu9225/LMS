-- Teachers: staff who manage documents, flags and chat logs for the subjects an admin assigns them.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'teacher', 'student'));

create table teacher_subjects (
  teacher_id uuid not null references profiles on delete cascade,
  subject_id uuid not null references subjects on delete cascade,
  primary key (teacher_id, subject_id),
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index teacher_subjects_subject_idx on teacher_subjects (subject_id);
create trigger audit_stamp before insert or update on teacher_subjects
  for each row execute function public.audit_stamp();
alter table teacher_subjects enable row level security;

-- Practice quizzes: AI-generated multiple-choice questions from one unit's live material.
-- questions holds the answer key; the app sends only question + options to the browser before submit.
create table practice_quizzes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles on delete cascade,
  unit_id uuid not null references units on delete cascade,
  lang text not null check (lang in ('si', 'en')),
  questions jsonb not null,
  answers int[],
  score int,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index practice_quizzes_student_time_idx on practice_quizzes (student_id, created_at desc);
create trigger audit_stamp before insert or update on practice_quizzes
  for each row execute function public.audit_stamp();
alter table practice_quizzes enable row level security;

-- Classes group students under a teacher for one subject. They do not restrict tutor access.
create table classes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects,
  teacher_id uuid references profiles on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  batch_year int check (batch_year between 2000 and 2100),
  join_code char(8) not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index classes_teacher_idx on classes (teacher_id);
create index classes_subject_idx on classes (subject_id);

create table class_members (
  class_id uuid not null references classes on delete cascade,
  student_id uuid not null references profiles on delete cascade,
  primary key (class_id, student_id),
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index class_members_student_idx on class_members (student_id);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index announcements_class_time_idx on announcements (class_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['classes', 'class_members', 'announcements'] loop
    execute format('create trigger audit_stamp before insert or update on public.%I
      for each row execute function public.audit_stamp()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

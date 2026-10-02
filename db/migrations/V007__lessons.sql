-- Lessons per unit: Markdown notes, an optional YouTube video and links to textbook pages.
create table lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 50000),
  youtube_id char(11) check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index lessons_unit_idx on lessons (unit_id, sort_order);

create table lesson_pages (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons on delete cascade,
  document_id uuid not null references documents on delete cascade,
  page_from int not null check (page_from >= 1),
  page_to int not null,
  sort_order int not null default 0,
  check (page_to >= page_from),
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index lesson_pages_lesson_idx on lesson_pages (lesson_id, sort_order);
create index lesson_pages_document_idx on lesson_pages (document_id);

create table lesson_progress (
  lesson_id uuid not null references lessons on delete cascade,
  student_id uuid not null references profiles on delete cascade,
  primary key (lesson_id, student_id),
  created_at timestamptz not null default now(),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);
create index lesson_progress_student_idx on lesson_progress (student_id);

do $$
declare t text;
begin
  foreach t in array array['lessons', 'lesson_pages', 'lesson_progress'] loop
    execute format('create trigger audit_stamp before insert or update on public.%I
      for each row execute function public.audit_stamp()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

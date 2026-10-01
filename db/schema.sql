create extension if not exists vector;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'student' check (role in ('admin', 'student')),
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name_si text not null,
  name_en text not null
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects on delete cascade,
  name_si text not null,
  name_en text not null,
  sort_order int not null default 0
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects,
  title text not null,
  doc_type text not null check (doc_type in ('textbook', 'past_paper', 'marking_scheme', 'syllabus', 'other')),
  year int,
  storage_path text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'review', 'live', 'failed', 'archived')),
  page_count int not null default 0,
  pages_done int not null default 0,
  error text,
  uploaded_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents on delete cascade,
  page_no int not null,
  unit_id uuid references units on delete set null,
  text text not null default '',
  ocr_failed boolean not null default false,
  reviewed boolean not null default false,
  unique (document_id, page_no)
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents on delete cascade,
  subject_id uuid not null references subjects,
  unit_id uuid references units on delete set null,
  page_no int not null,
  content text not null,
  embedding vector(768) not null
);
-- ponytail: exact scan filtered by subject (no HNSW). Exact and fast to ~100k chunks;
-- past that add: create index on chunks using hnsw (embedding vector_cosine_ops) + hnsw.iterative_scan.
create index if not exists chunks_subject_idx on chunks (subject_id);
create index if not exists chunks_doc_page_idx on chunks (document_id, page_no);

create table if not exists chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  subject_id uuid references subjects on delete set null,
  question text not null,
  answer text not null,
  chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists chat_logs_user_time_idx on chat_logs (user_id, created_at);

-- The app talks to Postgres directly (bypasses RLS). RLS with no policies blocks the public Data API.
alter table profiles enable row level security;
alter table subjects enable row level security;
alter table units enable row level security;
alter table documents enable row level security;
alter table pages enable row level security;
alter table chunks enable row level security;
alter table chat_logs enable row level security;

-- Create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Private bucket: PDFs only, 200 MB max.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 209715200, array['application/pdf'])
on conflict (id) do nothing;

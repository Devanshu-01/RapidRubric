-- ============================================================================
-- RapidRubric — Database Schema (PostgreSQL)
-- CSCI 4177/5709 Assignment 2 — Standalone implementation schema
--
-- This schema is self-contained: it runs on any standard PostgreSQL 13+ instance
-- (Render PostgreSQL, Railway, Supabase, or local) without requiring Supabase
-- Auth. Identities live in the `profiles` table and are authenticated with a
-- bcrypt password hash + application-issued JWT.
-- ============================================================================

create extension if not exists "pgcrypto";   -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('student', 'ta', 'instructor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum (
    'ai_processing',
    'pending_ta_review',
    'pending_instructor_approval',
    'released',
    'returned'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_status as enum ('pending_ta_review', 'released');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles  (user / authentication entity)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  full_name     varchar(255) not null check (char_length(trim(full_name)) > 0),
  email         varchar(255) not null unique check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  role          user_role    not null default 'student',
  password_hash varchar(255) not null,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  deleted_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- courses + enrollments  (scoping)
-- ---------------------------------------------------------------------------
create table if not exists courses (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(255) not null check (char_length(trim(name)) > 0),
  enrollment_code varchar(8)   not null unique check (enrollment_code ~ '^[A-Z0-9]{4,8}$'),
  instructor_id   uuid         not null references profiles(id) on delete restrict,
  created_at      timestamptz  not null default now()
);

create table if not exists course_enrollments (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       user_role not null check (role in ('student', 'ta')),
  created_at timestamptz not null default now(),
  unique (course_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- rubrics  (Rubric Builder feature)
-- ---------------------------------------------------------------------------
create table if not exists rubrics (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references profiles(id) on delete restrict,
  title         varchar(255) not null check (char_length(trim(title)) > 0),
  criteria      jsonb not null,            -- [{id,name,description,max_score}]
  locked        boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
create table if not exists assignments (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid references courses(id) on delete cascade,
  rubric_id          uuid not null references rubrics(id) on delete restrict,
  ta_id              uuid references profiles(id) on delete set null,
  title              varchar(255) not null check (char_length(trim(title)) > 0),
  due_at             timestamptz not null,
  file_size_limit    integer not null default 10485760,   -- bytes (10 MB)
  allow_resubmission boolean not null default false,
  locked             boolean not null default false,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- submissions  (Draft Submission & File Upload feature)
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id    uuid not null references profiles(id) on delete restrict,
  ta_id         uuid references profiles(id) on delete set null,
  storage_path  text not null,
  comments      text,
  status        submission_status not null default 'ai_processing',
  version       integer not null default 1,
  created_at    timestamptz not null default now()
);
create index if not exists idx_submissions_ta on submissions(ta_id);
create index if not exists idx_submissions_status on submissions(status);

-- ---------------------------------------------------------------------------
-- ai_feedback  (AI first-pass output + immutable baseline)
-- ---------------------------------------------------------------------------
create table if not exists ai_feedback (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null unique references submissions(id) on delete cascade,
  criteria       jsonb not null,            -- [{id,score,feedback,version_diff}]
  flagged_issues jsonb,
  summary        text,
  ai_baseline    jsonb not null,            -- frozen copy of criteria for edit-integrity diff
  status         feedback_status not null default 'pending_ta_review',
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ta_reviews  (TA Review & Approval feature)
-- ---------------------------------------------------------------------------
create table if not exists ta_reviews (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null unique references submissions(id) on delete cascade,
  ta_id           uuid not null references profiles(id) on delete restrict,
  criteria        jsonb not null,           -- TA-edited [{id,score,feedback}]
  total_score     numeric(6,2) not null,
  overall_comment text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_log  (security / accountability entity)
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null references profiles(id) on delete restrict,
  action     varchar(64) not null,
  target_id  uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_target on audit_log(target_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger for profiles
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();

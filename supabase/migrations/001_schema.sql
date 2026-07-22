-- Midnight Mentor — Supabase Schema
-- Run this in the Supabase SQL Editor to set up the database.

-- ===== Profiles (extends Supabase Auth) =====
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  uid text unique not null,
  email text unique not null,
  nome text not null,
  sobrenome text default '',
  meta_estudo text default '',
  escola_id text default '',
  turma_id text default '',
  created_at timestamptz default now()
);

-- ===== Schools =====
create table if not exists public.escolas (
  id text primary key,
  nome text not null,
  cidade text default '',
  cor text default '#f59e0b',
  created_at timestamptz default now()
);

create table if not exists public.turmas (
  id text primary key,
  nome text not null,
  escola_id text references public.escolas(id) on delete cascade not null,
  ano text default '',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- ===== Gamification =====
create table if not exists public.gamification (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  xp integer default 0,
  level integer default 1,
  streak integer default 1,
  last_access_date text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_uid)
);
alter table public.gamification enable row level security;

-- ===== Logs =====
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  timestamp bigint not null,
  type text not null,
  description text not null,
  xp integer default 0
);
alter table public.logs enable row level security;

-- ===== Chat Messages =====
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  message_id text not null,
  role text not null,
  text text not null,
  timestamp bigint not null,
  mood text default '',
  image text default ''
);
alter table public.chat_messages enable row level security;

-- ===== Notes (Caderno) =====
create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  note_id text not null,
  text text not null,
  data text not null,
  tag text default ''
);
alter table public.notas enable row level security;

-- ===== Quiz Results =====
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  materia text not null,
  acertos integer not null,
  total integer not null,
  xp_ganho integer not null,
  timestamp bigint not null
);
alter table public.quiz_results enable row level security;

-- ===== Personas =====
create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  persona_id text not null,
  name text not null,
  icon text default '🧠',
  color text default '#f59e0b',
  instruction text not null,
  created_at bigint not null
);
alter table public.personas enable row level security;

-- ===== Essay Corrections =====
create table if not exists public.essay_corrections (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  nota_final integer not null,
  competencia1 integer not null,
  competencia2 integer not null,
  competencia3 integer not null,
  competencia4 integer not null,
  competencia5 integer not null,
  pontos_fortes text[] default '{}',
  pontos_melhorar text[] default '{}',
  original_text text default '',
  created_at timestamptz default now()
);
alter table public.essay_corrections enable row level security;

-- ===== Mood History =====
create table if not exists public.mood_history (
  id uuid primary key default gen_random_uuid(),
  user_uid text references public.profiles(uid) on delete cascade not null,
  mood text not null,
  timestamp bigint not null
);
alter table public.mood_history enable row level security;

-- ===== RLS Policies =====
-- Each user can only read/write their own data

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = auth_id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = auth_id);

create policy "Users can read own gamification"
  on public.gamification for select using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can upsert own gamification"
  on public.gamification for all using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));

create policy "Users can read own logs"
  on public.logs for select using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can insert own logs"
  on public.logs for insert with check (user_uid in (select uid from public.profiles where auth_id = auth.uid()));

create policy "Users can read own chat"
  on public.chat_messages for select using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can insert own chat"
  on public.chat_messages for insert with check (user_uid in (select uid from public.profiles where auth_id = auth.uid()));

create policy "Users can read own notas"
  on public.notas for select using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can insert own notas"
  on public.notas for insert with check (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can delete own notas"
  on public.notas for delete using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));

create policy "Users can read own quiz"
  on public.quiz_results for select using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can insert own quiz"
  on public.quiz_results for insert with check (user_uid in (select uid from public.profiles where auth_id = auth.uid()));

create policy "Users can read own personas"
  on public.personas for select using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can insert own personas"
  on public.personas for insert with check (user_uid in (select uid from public.profiles where auth_id = auth.uid()));
create policy "Users can delete own personas"
  on public.personas for delete using (user_uid in (select uid from public.profiles where auth_id = auth.uid()));

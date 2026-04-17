-- English Journal DB Schema
-- Supabase SQL Editor에서 실행하세요

-- 1. users (Supabase Auth의 auth.users 확장)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  level integer default 1,
  created_at timestamptz default now()
);

alter table public.users enable row level security;
create policy "Users can read own data" on public.users for select using (auth.uid() = id);
create policy "Users can update own data" on public.users for update using (auth.uid() = id);

-- 자동 생성: 회원가입 시 public.users에 레코드 추가
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. journal_entries
create table public.journal_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  date date default current_date,
  original_text text not null,
  corrected_text text,
  coach_feedback text,
  focus_areas text[] default '{}',
  difficulty_level text default 'normal' check (difficulty_level in ('easy', 'normal', 'hard')),
  created_at timestamptz default now()
);

alter table public.journal_entries enable row level security;
create policy "Users can CRUD own entries" on public.journal_entries for all using (auth.uid() = user_id);
create index idx_journal_entries_user_date on public.journal_entries(user_id, date desc);

-- 3. entry_scores
create table public.entry_scores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  entry_id uuid references public.journal_entries(id) on delete cascade not null,
  vocabulary_score integer check (vocabulary_score between 0 and 100),
  grammar_score integer check (grammar_score between 0 and 100),
  expression_score integer check (expression_score between 0 and 100),
  accuracy_score integer check (accuracy_score between 0 and 100),
  eqs integer check (eqs between 0 and 100),
  vocab_level text check (vocab_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  scored_at timestamptz default now()
);

alter table public.entry_scores enable row level security;
create policy "Users can CRUD own scores" on public.entry_scores for all using (auth.uid() = user_id);

-- 4. mistake_patterns
create table public.mistake_patterns (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  pattern_name text not null,
  rule text,
  count integer default 1,
  consecutive_clean integer default 0,
  status text default 'active' check (status in ('active', 'improving', 'cleared')),
  examples text[] default '{}',
  last_seen_at timestamptz default now(),
  cleared_at timestamptz
);

alter table public.mistake_patterns enable row level security;
create policy "Users can CRUD own patterns" on public.mistake_patterns for all using (auth.uid() = user_id);
create index idx_mistake_patterns_user_status on public.mistake_patterns(user_id, status);

-- 5. expressions
create table public.expressions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  expression text not null,
  meaning text,
  example_sentence text,
  usage_count integer default 0,
  last_used_at timestamptz,
  status text default 'active' check (status in ('active', 'dormant', 'forgotten')),
  source_entry_id uuid references public.journal_entries(id) on delete set null,
  learned_at timestamptz default now()
);

alter table public.expressions enable row level security;
create policy "Users can CRUD own expressions" on public.expressions for all using (auth.uid() = user_id);

-- 6. recommended_content
create table public.recommended_content (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  type text not null check (type in ('expression', 'grammar', 'vocabulary', 'phrasal_verb')),
  content text not null,
  meaning text,
  example text,
  context text,
  difficulty text default 'intermediate' check (difficulty in ('easy', 'intermediate', 'advanced')),
  is_saved boolean default false,
  recommended_at timestamptz default now(),
  source text default 'ai_curated' check (source in ('ai_curated', 'level_based', 'mistake_based'))
);

alter table public.recommended_content enable row level security;
create policy "Users can CRUD own content" on public.recommended_content for all using (auth.uid() = user_id);

-- 7. quiz_attempts
create table public.quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  quiz_type text not null check (quiz_type in ('error_correction', 'fill_blank', 'expression_choice')),
  question text not null,
  correct_answer text not null,
  user_answer text,
  is_correct boolean,
  related_pattern_id uuid references public.mistake_patterns(id) on delete set null,
  attempted_at timestamptz default now()
);

alter table public.quiz_attempts enable row level security;
create policy "Users can CRUD own attempts" on public.quiz_attempts for all using (auth.uid() = user_id);

-- 8. user_stats
create table public.user_stats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade unique not null,
  current_eqs integer default 0,
  level integer default 1,
  global_rank integer,
  weekly_eqs_gain integer default 0,
  weekly_rank integer,
  total_entries integer default 0,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_entry_date date,
  updated_at timestamptz default now()
);

alter table public.user_stats enable row level security;
create policy "Users can read own stats" on public.user_stats for select using (auth.uid() = user_id);
create policy "Users can update own stats" on public.user_stats for update using (auth.uid() = user_id);

-- user_stats 자동 생성: users 레코드 생성 시
create or replace function public.handle_new_user_stats()
returns trigger as $$
begin
  insert into public.user_stats (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_user_created_stats
  after insert on public.users
  for each row execute function public.handle_new_user_stats();

-- 순위 조회용 함수
create or replace function public.get_rankings()
returns table (
  user_id uuid,
  email text,
  current_eqs integer,
  level integer,
  global_rank bigint
) as $$
begin
  return query
    select
      us.user_id,
      u.email,
      us.current_eqs,
      us.level,
      rank() over (order by us.current_eqs desc) as global_rank
    from public.user_stats us
    join public.users u on u.id = us.user_id;
end;
$$ language plpgsql security definer;

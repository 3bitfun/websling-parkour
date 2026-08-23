-- ============================================================
-- WEBSLING PARKOUR — Supabase schema
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- Every table / function / policy / index is prefixed "websling_"
-- so it stays clearly separated from other data in this project.
--
-- AFTER RUNNING: Dashboard -> Authentication -> Providers -> Email
--   -> turn OFF "Confirm email" so new pilots can play immediately.
-- ============================================================

-- ---------- accounts ----------
-- Supabase Auth (auth.users) handles credentials. This table stores
-- the in-game identity for each authenticated user.
create table if not exists public.websling_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Spider',
  created_at   timestamptz not null default now()
);

-- ---------- leaderboard entries ----------
-- One row per finished run. The leaderboard reads each pilot's best.
create table if not exists public.websling_scores (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.websling_profiles (user_id) on delete cascade,
  mode        text not null check (mode in ('solo', 'free', 'versus')),
  score       integer not null check (score >= 0 and score <= 20000000),
  tokens      integer not null default 0 check (tokens >= 0),
  max_combo   integer not null default 0 check (max_combo >= 0),
  best_swing  integer not null default 0 check (best_swing >= 0),
  time_left   integer not null default 0 check (time_left >= 0),
  placement   integer check (placement is null or placement > 0), -- versus only
  created_at  timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.websling_profiles enable row level security;
alter table public.websling_scores   enable row level security;

drop policy if exists websling_profiles_read_all   on public.websling_profiles;
drop policy if exists websling_profiles_insert_own on public.websling_profiles;
drop policy if exists websling_profiles_update_own on public.websling_profiles;

create policy websling_profiles_read_all   on public.websling_profiles for select using (true);
create policy websling_profiles_insert_own on public.websling_profiles for insert with check (auth.uid() = user_id);
create policy websling_profiles_update_own on public.websling_profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists websling_scores_read_all   on public.websling_scores;
drop policy if exists websling_scores_insert_own on public.websling_scores;
drop policy if exists websling_scores_delete_own on public.websling_scores;

create policy websling_scores_read_all   on public.websling_scores for select using (true);
create policy websling_scores_insert_own on public.websling_scores for insert with check (auth.uid() = user_id);
create policy websling_scores_delete_own on public.websling_scores for delete using (auth.uid() = user_id);

-- ---------- auto-create a profile on signup ----------
create or replace function public.websling_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.websling_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
             'Spider-' || substr(new.id::text, 1, 4))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists websling_on_auth_user_created on auth.users;
create trigger websling_on_auth_user_created
  after insert on auth.users
  for each row execute function public.websling_handle_new_user();

-- ---------- leaderboard query (best score per pilot) ----------
create or replace function public.websling_leaderboard(p_mode text default null, p_limit integer default 100)
returns table (
  user_id      uuid,
  display_name text,
  mode         text,
  score        integer,
  tokens       integer,
  max_combo    integer,
  best_swing   integer,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.user_id, b.display_name, b.mode, b.score, b.tokens, b.max_combo, b.best_swing, b.created_at
  from (
    select distinct on (s.user_id)
      s.user_id, p.display_name, s.mode, s.score, s.tokens, s.max_combo, s.best_swing, s.created_at
    from public.websling_scores s
    join public.websling_profiles p on p.user_id = s.user_id
    where p_mode is null or s.mode = p_mode
    order by s.user_id, s.score desc, s.created_at asc
  ) b
  order by b.score desc
  limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.websling_leaderboard(text, integer) to anon, authenticated;

-- ---------- indexes ----------
create index if not exists websling_scores_mode_score_idx on public.websling_scores (mode, score desc);
create index if not exists websling_scores_user_idx       on public.websling_scores (user_id);

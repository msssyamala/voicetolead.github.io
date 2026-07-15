create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  user_role text,
  age_range text,
  main_goal text,
  experience_level text,
  hardest_part text,
  mentor_interest text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create index if not exists user_profiles_updated_at_idx
  on public.user_profiles(updated_at desc);

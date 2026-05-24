create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.focus_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#1A2E4A',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.focus_categories(id) on delete set null,
  planned_minutes integer not null check (planned_minutes > 0),
  actual_seconds integer not null check (actual_seconds >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  status text not null check (status in ('completed', 'canceled')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.focus_categories enable row level security;
alter table public.focus_sessions enable row level security;

drop policy if exists "profiles are owned by the signed-in user"
on public.profiles;

create policy "profiles are owned by the signed-in user"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "categories are owned by the signed-in user"
on public.focus_categories;

create policy "categories are owned by the signed-in user"
on public.focus_categories
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "sessions are owned by the signed-in user"
on public.focus_sessions;

create policy "sessions are owned by the signed-in user"
on public.focus_sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists focus_categories_user_id_idx
on public.focus_categories (user_id);

create index if not exists focus_sessions_user_ended_at_idx
on public.focus_sessions (user_id, ended_at desc);

create index if not exists focus_sessions_user_category_idx
on public.focus_sessions (user_id, category_id);

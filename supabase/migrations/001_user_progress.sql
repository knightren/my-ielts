-- 在 Supabase → SQL Editor 中执行本文件，或通过 CLI 迁移部署
-- 学习进度：与前端 localStorage 键对应的 JSON 一并存入 payload

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_progress_updated_at_idx on public.user_progress (updated_at desc);

alter table public.user_progress enable row level security;

create policy "user_progress_select_own"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "user_progress_insert_own"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "user_progress_update_own"
  on public.user_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_progress_delete_own"
  on public.user_progress for delete
  using (auth.uid() = user_id);

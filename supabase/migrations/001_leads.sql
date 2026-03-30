-- Tabela de leads (um por áudio analisado)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript text,
  summary text not null default '',
  score smallint not null default 0 check (score >= 0 and score <= 10),
  next_step text not null default '',
  bant_reasons text default '',
  created_at timestamptz not null default now()
);

-- RLS: usuário só vê e insere seus próprios leads
alter table public.leads enable row level security;

drop policy if exists "Users can read own leads" on public.leads;
create policy "Users can read own leads"
  on public.leads for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own leads" on public.leads;
create policy "Users can insert own leads"
  on public.leads for insert
  with check (auth.uid() = user_id);

-- Índice para listar por usuário e data
create index if not exists leads_user_created on public.leads (user_id, created_at desc);

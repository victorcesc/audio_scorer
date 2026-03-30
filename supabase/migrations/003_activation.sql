-- Tokens de ativação (gerados pelo admin; cada um pode ser usado uma vez)
create table if not exists public.activation_tokens (
  token text primary key,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by_phone text
);

-- Números de WhatsApp autorizados a usar o bot (após ativar com um token)
create table if not exists public.authorized_whatsapp_numbers (
  phone text primary key,
  created_at timestamptz not null default now()
);

-- RLS: acesso via service_role (API) apenas; anon não precisa
alter table public.activation_tokens enable row level security;
alter table public.authorized_whatsapp_numbers enable row level security;

drop policy if exists "Service role full access activation_tokens" on public.activation_tokens;
create policy "Service role full access activation_tokens"
  on public.activation_tokens for all
  using (true)
  with check (true);

drop policy if exists "Service role full access authorized_whatsapp_numbers" on public.authorized_whatsapp_numbers;
create policy "Service role full access authorized_whatsapp_numbers"
  on public.authorized_whatsapp_numbers for all
  using (true)
  with check (true);

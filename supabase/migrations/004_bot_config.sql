-- Configuração de formato de resposta do bot por número (JSON; null = defaults na aplicação)
alter table public.authorized_whatsapp_numbers
  add column if not exists bot_config jsonb;

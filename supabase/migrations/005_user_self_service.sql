-- Perfil estendido (cadastro self-service)
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists document text;

-- Dono da linha WhatsApp + contador de áudios processados pelo bot (lote = soma dos itens)
alter table public.authorized_whatsapp_numbers
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists audio_analyzed_count integer not null default 0;

create index if not exists authorized_whatsapp_numbers_user_id_idx
  on public.authorized_whatsapp_numbers (user_id);

-- Copia metadados do signup (raw_user_meta_data) para profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, document)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'document', ''), '\D', '', 'g'), '')
  )
  on conflict (id) do update set
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    document = coalesce(nullif(excluded.document, ''), public.profiles.document);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Remove política permissiva (expunha todas as linhas a usuários autenticados via anon key)
drop policy if exists "Service role full access authorized_whatsapp_numbers" on public.authorized_whatsapp_numbers;

drop policy if exists "Users select own whatsapp numbers" on public.authorized_whatsapp_numbers;
create policy "Users select own whatsapp numbers"
  on public.authorized_whatsapp_numbers for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own whatsapp numbers" on public.authorized_whatsapp_numbers;
create policy "Users insert own whatsapp numbers"
  on public.authorized_whatsapp_numbers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own whatsapp numbers" on public.authorized_whatsapp_numbers;
create policy "Users update own whatsapp numbers"
  on public.authorized_whatsapp_numbers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own whatsapp numbers" on public.authorized_whatsapp_numbers;
create policy "Users delete own whatsapp numbers"
  on public.authorized_whatsapp_numbers for delete
  using (auth.uid() = user_id);

-- service_role (API admin) continua ignorando RLS; incremento atômico a partir da rota do bot
create or replace function public.increment_whatsapp_audio_count(p_phone text, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.authorized_whatsapp_numbers
  set audio_analyzed_count = audio_analyzed_count + greatest(p_delta, 0)
  where phone = p_phone;
end;
$$;

revoke all on function public.increment_whatsapp_audio_count(text, int) from public;
grant execute on function public.increment_whatsapp_audio_count(text, int) to service_role;

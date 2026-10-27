-- Migración 3: historial de conversaciones del asistente.
-- Pegar en Supabase → SQL Editor → Run.
create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  conversation_id  text not null,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  botones          jsonb,
  nota             text,
  user_email       text
);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at);

alter table public.chat_messages enable row level security;
drop policy if exists "usuarios logueados" on public.chat_messages;
create policy "usuarios logueados" on public.chat_messages for all to authenticated using (true) with check (true);

-- Mejoras pedidas desde el asistente (para el programador).
-- Pegar en Supabase → SQL Editor → Run.
create table if not exists public.feature_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  titulo       text not null,
  descripcion  text not null,
  flujo        text,
  datos        text,
  prioridad    text not null default 'media',
  estado       text not null default 'pendiente',   -- pendiente | en_desarrollo | listo | descartado
  conversacion jsonb,                                -- últimos mensajes del chat, para contexto
  pedido_por   text
);

alter table public.feature_requests enable row level security;
drop policy if exists "usuarios logueados" on public.feature_requests;
create policy "usuarios logueados" on public.feature_requests for all to authenticated using (true) with check (true);

-- Migración 6: detección de errores. Pegar en Supabase → SQL Editor → Run.
create table if not exists public.app_errors (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  source       text not null,              -- pantalla | base | arca | asistente | red | otro
  message      text not null,
  stack        text,
  route        text,
  user_email   text,
  user_agent   text,
  context      jsonb,
  count        integer not null default 1, -- veces que se repitió (mismo origen + mensaje + pantalla, en 24 h)
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  notes        text,
  analysis     text                        -- diagnóstico del asistente
);
create index if not exists app_errors_open_idx on public.app_errors (resolved, last_seen desc);
alter table public.app_errors enable row level security;
drop policy if exists "usuarios logueados" on public.app_errors;
create policy "usuarios logueados" on public.app_errors for all to authenticated using (true) with check (true);

-- Registra un error agrupando repeticiones del mismo error en las últimas 24 h.
create or replace function public.log_app_error(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.app_errors
   where source = p->>'source' and message = p->>'message' and coalesce(route,'') = coalesce(p->>'route','')
     and resolved = false and last_seen > now() - interval '24 hours'
   order by last_seen desc limit 1;
  if v_id is not null then
    update public.app_errors
       set count = count + 1, last_seen = now(),
           context = coalesce(p->'context', context), user_email = coalesce(p->>'user_email', user_email), stack = coalesce(p->>'stack', stack)
     where id = v_id;
    return v_id;
  end if;
  insert into public.app_errors (source, message, stack, route, user_email, user_agent, context)
  values (p->>'source', p->>'message', p->>'stack', p->>'route', p->>'user_email', p->>'user_agent', p->'context')
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.log_app_error(jsonb) to authenticated, service_role, anon;

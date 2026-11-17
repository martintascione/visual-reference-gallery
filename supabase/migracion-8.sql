-- Recordatorio diario de seguimiento de presupuestos (lunes a viernes, 8:30 de Argentina = 11:30 UTC).
-- La clave que usa el cron la genera la base y queda en una tabla sin acceso público (RLS sin políticas).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.cron_secrets (
  id    text primary key,
  token text not null
);
alter table public.cron_secrets enable row level security;
revoke all on public.cron_secrets from anon, authenticated;

insert into public.cron_secrets (id, token)
values ('recordatorios', encode(gen_random_bytes(24), 'hex'))
on conflict (id) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'recordatorio-presupuestos';

select cron.schedule(
  'recordatorio-presupuestos',
  '30 11 * * 1-5',
  $$
  select net.http_post(
    url := 'https://iledqhvyuvgwpgedmjtj.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select token from public.cron_secrets where id = 'recordatorios')
    ),
    body := '{}'::jsonb
  );
  $$
);

select jobname, schedule, active from cron.job where jobname = 'recordatorio-presupuestos';

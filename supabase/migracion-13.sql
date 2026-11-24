-- Acopios: pagos a cuenta y retiros de mercadería.
create table if not exists public.stockpiles (
  id          text primary key,
  client_id   text,
  client_name text not null default '',
  date        text not null,
  note        text,
  payments    jsonb not null default '[]'::jsonb,
  withdrawals jsonb not null default '[]'::jsonb,
  closed      boolean,
  updated_at  timestamptz not null default now()
);
alter table public.stockpiles enable row level security;
drop policy if exists "usuarios logueados" on public.stockpiles;
create policy "usuarios logueados" on public.stockpiles for all to authenticated using (true) with check (true);
drop trigger if exists set_updated_at on public.stockpiles;
create trigger set_updated_at before update on public.stockpiles for each row execute function public.set_updated_at();
select (select relrowsecurity from pg_class where relname='stockpiles') as rls, (select count(*) from pg_policies where tablename='stockpiles') as pol;

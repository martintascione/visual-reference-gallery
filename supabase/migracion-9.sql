-- Descargas de proveedores (canteras y transportes) y sus pagos.
create table if not exists public.purchases (
  id            text primary key,
  date          text not null,
  supplier      text not null,
  remito        text,
  items         jsonb not null default '[]'::jsonb,
  carrier       text,
  freight_tons  numeric not null default 0,
  freight_rate  numeric not null default 0,
  freight_total numeric not null default 0,
  unload_cost   numeric not null default 0,
  note          text,
  updated_at    timestamptz not null default now()
);
create table if not exists public.supplier_payments (
  id          text primary key,
  date        text not null,
  party       text not null,
  kind        text not null,
  amount      numeric not null,
  method      text not null,
  account     text,
  detail      text,
  due_date    text,
  liters      numeric,
  expense_id  text,
  purchase_id text,
  updated_at  timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['purchases','supplier_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logueados" on public.%I', t);
    execute format('create policy "usuarios logueados" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
select count(*) as purchases, (select count(*) from public.supplier_payments) as pagos from public.purchases;

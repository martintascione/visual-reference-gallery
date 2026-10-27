-- =====================================================================
--  Áridos Petreos · esquema de base de datos
--  Pegar completo en Supabase → SQL Editor → Run.
--  Se puede volver a correr: no borra datos (solo crea lo que falta).
-- =====================================================================

-- Productos y calculadora de precios
create table if not exists public.products (
  id          text primary key,
  name        text not null,
  category    text not null check (category in ('piedra','laja','liquido','unitario')),
  unit        text not null check (unit in ('kg','m2','l','u')),
  cost        numeric not null default 0,
  price       numeric not null default 0,
  bag_kg      numeric,
  bag_price   numeric,
  liters      numeric,
  stock       numeric not null default 0,
  min_stock   numeric not null default 0,
  iva_pct     numeric not null default 21,
  discounts   jsonb not null default '[]'::jsonb,
  stone_cost  jsonb,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Clientes
create table if not exists public.clients (
  id            text primary key,
  name          text not null,
  phone         text,
  cuit          text,
  address       text,
  credit_limit  numeric not null default 0,
  note          text,
  updated_at    timestamptz not null default now()
);

-- Ventas (los renglones y los pagos van como JSON dentro de la venta)
create table if not exists public.sales (
  id             text primary key,
  number         integer not null,
  date           text not null,            -- ISO local, ej. 2026-10-27T14:05:00
  client_id      text references public.clients(id) on delete set null,
  client_name    text not null,
  items          jsonb not null default '[]'::jsonb,
  delivery       jsonb,
  payments       jsonb not null default '[]'::jsonb,
  with_iva       boolean not null default false,
  subtotal       numeric not null default 0,
  iva            numeric not null default 0,
  total          numeric not null default 0,
  cost           numeric not null default 0,
  note           text,
  closure_id     text,
  from_quote_id  text,
  updated_at     timestamptz not null default now()
);
create index if not exists sales_date_idx on public.sales (date desc);
create index if not exists sales_closure_idx on public.sales (closure_id);

-- Presupuestos
create table if not exists public.quotes (
  id           text primary key,
  number       integer not null,
  date         text not null,
  valid_until  text not null,
  follow_up    text,
  client_id    text references public.clients(id) on delete set null,
  client_name  text not null,
  phone        text,
  items        jsonb not null default '[]'::jsonb,
  delivery     jsonb,
  with_iva     boolean not null default false,
  subtotal     numeric not null default 0,
  iva          numeric not null default 0,
  total        numeric not null default 0,
  status       text not null default 'enviado',
  note         text,
  lost_reason  text,
  updated_at   timestamptz not null default now()
);

-- Cuotas de cuenta corriente
create table if not exists public.dues (
  id         text primary key,
  client_id  text not null references public.clients(id) on delete cascade,
  sale_id    text,
  n          integer not null,
  "of"       integer not null,
  due_date   text not null,
  amount     numeric not null,
  paid       numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists dues_client_idx on public.dues (client_id);

-- Cheques
create table if not exists public.cheques (
  id            text primary key,
  number        text not null,
  bank          text not null,
  drawer        text not null default '',
  due_date      text not null,
  amount        numeric not null,
  status        text not null default 'cartera',
  client_id     text references public.clients(id) on delete set null,
  client_name   text not null default '',
  sale_id       text,
  deposit_bank  text,
  echeq         boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- Movimientos de caja y bancos
create table if not exists public.movements (
  id           text primary key,
  date         text not null,
  kind         text not null,
  account      text not null,
  amount       numeric not null,
  concept      text not null,
  method       text,
  gateway      text,
  fee_pct      numeric,
  settle_days  integer,
  settled      boolean,
  ref_id       text,
  closure_id   text,
  updated_at   timestamptz not null default now()
);
create index if not exists movements_date_idx on public.movements (date desc);

-- Gastos y débitos
create table if not exists public.expenses (
  id          text primary key,
  date        text not null,
  type        text not null,
  concept     text not null,
  amount      numeric not null,
  account     text not null,
  method      text not null,
  closure_id  text,
  updated_at  timestamptz not null default now()
);

-- Movimientos de stock
create table if not exists public.stock_moves (
  id          text primary key,
  date        text not null,
  product_id  text not null references public.products(id) on delete cascade,
  qty         numeric not null,
  reason      text not null,
  note        text,
  updated_at  timestamptz not null default now()
);
create index if not exists stock_moves_product_idx on public.stock_moves (product_id);

-- Cierres de día
create table if not exists public.closures (
  id              text primary key,
  date            text not null,
  sale_ids        jsonb not null default '[]'::jsonb,
  by_method       jsonb not null default '[]'::jsonb,
  sales_total     numeric not null default 0,
  cost_total      numeric not null default 0,
  fees_total      numeric not null default 0,
  expenses_total  numeric not null default 0,
  fixed_share     numeric not null default 0,
  profit          numeric not null default 0,
  cash_expected   numeric not null default 0,
  cash_counted    numeric not null default 0,
  note            text,
  updated_at      timestamptz not null default now()
);

-- Configuración (una sola fila) y contadores de numeración
create table if not exists public.settings (
  id          text primary key default 'main',
  data        jsonb not null,
  counters    jsonb not null default '{"sale":1000,"quote":500}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- =====================================================================
--  Seguridad: solo usuarios logueados (la dueña) pueden leer y escribir.
--  La clave publicable sin login no puede ver nada.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['products','clients','sales','quotes','dues','cheques','movements','expenses','stock_moves','closures','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logueados" on public.%I', t);
    execute format('create policy "usuarios logueados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- updated_at automático
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['products','clients','sales','quotes','dues','cheques','movements','expenses','stock_moves','closures','settings']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

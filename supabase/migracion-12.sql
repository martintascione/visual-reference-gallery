-- Flete por su cuenta, colocación y flete automático por envío.
alter table public.sales add column if not exists pickup_fee numeric;
alter table public.quotes add column if not exists pickup_fee numeric;
alter table public.sales add column if not exists install jsonb;
alter table public.quotes add column if not exists install jsonb;
alter table public.products add column if not exists truck jsonb;
alter table public.products add column if not exists bottle_cost numeric;

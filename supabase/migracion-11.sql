-- Deudas con proveedores cargadas a mano (sin mercadería).
alter table public.purchases add column if not exists debt_only text;

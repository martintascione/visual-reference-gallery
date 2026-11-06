-- Migración 7: email del cliente (para enviar facturas).
alter table public.clients add column if not exists email text;

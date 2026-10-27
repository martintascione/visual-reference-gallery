-- Migración 2: presupuestos en PDF, bonificación, marca "falta facturar" y datos fiscales del cliente.
-- Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
alter table public.sales   add column if not exists invoice_pending boolean;
alter table public.sales   add column if not exists discount_pct numeric;
alter table public.quotes  add column if not exists discount_pct numeric;
alter table public.clients add column if not exists city text;
alter table public.clients add column if not exists dni text;
alter table public.clients add column if not exists iva_category text;

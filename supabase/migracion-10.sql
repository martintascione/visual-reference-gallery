-- Aviso para pagar el saldo a la cantera y al transporte de cada descarga.
alter table public.purchases add column if not exists pay_due text;
alter table public.purchases add column if not exists freight_due text;
-- Historial de cheques: propios, cuándo se recibió y a quién se entregó.
alter table public.cheques add column if not exists own boolean;
alter table public.cheques add column if not exists received_date text;
alter table public.cheques add column if not exists given_to text;
alter table public.cheques add column if not exists given_date text;
alter table public.supplier_payments add column if not exists cheque_id text;
select count(*) as columnas from information_schema.columns
where table_schema='public' and (table_name, column_name) in
(('purchases','pay_due'),('purchases','freight_due'),('cheques','own'),('cheques','received_date'),('cheques','given_to'),('cheques','given_date'),('supplier_payments','cheque_id'));

-- Quién cobra la descarga y aviso de su saldo.
alter table public.purchases add column if not exists unload_by text;
alter table public.purchases add column if not exists unload_due text;

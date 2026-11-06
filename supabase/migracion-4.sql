-- Migración 4: facturación electrónica ARCA (+ historial del asistente, por si no corriste la 3).
-- Pegar en Supabase → SQL Editor → Run.

-- Historial del asistente (migración 3)
create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  conversation_id  text not null,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  botones          jsonb,
  nota             text,
  user_email       text
);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at);
alter table public.chat_messages enable row level security;
drop policy if exists "usuarios logueados" on public.chat_messages;
create policy "usuarios logueados" on public.chat_messages for all to authenticated using (true) with check (true);

-- Emisores (CUIT + certificado público). La clave privada va en los secretos de la Edge Function (ARCA_RI_KEY / ARCA_MONO_KEY).
create table if not exists public.arca_issuers (
  key         text primary key,            -- 'ri' | 'mono'
  cuit        text not null,
  name        text,
  cert        text not null,               -- certificado PEM emitido por ARCA
  cert_expires date,
  updated_at  timestamptz not null default now()
);
alter table public.arca_issuers enable row level security;
-- Solo la Edge Function (service role) lee esta tabla; el navegador no la necesita.

-- Tickets de acceso (WSAA) cacheados, duran 12 h.
create table if not exists public.arca_tokens (
  issuer      text not null,
  service     text not null,
  token       text not null,
  sign        text not null,
  expires_at  timestamptz not null,
  primary key (issuer, service)
);
alter table public.arca_tokens enable row level security;

-- Facturas emitidas.
create table if not exists public.invoices (
  id            text primary key,
  created_at    timestamptz not null default now(),
  issuer        text not null,             -- 'ri' | 'mono'
  cuit_emisor   text not null,
  pto_vta       integer not null,
  cbte_tipo     integer not null,          -- 1 A, 6 B, 11 C
  cbte_nro      integer not null,
  cae           text not null,
  cae_vto       text not null,             -- yyyymmdd
  fecha         text not null,             -- yyyy-mm-dd
  doc_tipo      integer not null,
  doc_nro       text not null,
  client_id     text,
  client_name   text not null,
  client_address text,
  client_iva    text,
  condicion_iva_receptor integer not null,
  concepto      integer not null default 1,
  items         jsonb not null default '[]'::jsonb,
  neto          numeric not null,
  iva           numeric not null,
  total         numeric not null,
  note          text,
  sale_id       text,
  quote_id      text,
  status        text not null default 'emitida',
  updated_at    timestamptz not null default now()
);
create index if not exists invoices_fecha_idx on public.invoices (fecha);
alter table public.invoices enable row level security;
drop policy if exists "usuarios logueados" on public.invoices;
create policy "usuarios logueados" on public.invoices for all to authenticated using (true) with check (true);

-- Emisor Responsable Inscripto (CUIT 20-14849915-3, alias aridosmono, vence 2028-11-05)
insert into public.arca_issuers (key, cuit, name, cert, cert_expires) values ('ri', '20148499153', 'GONZALEZ FELIX OSCAR', '-----BEGIN CERTIFICATE-----
MIIDRTCCAi2gAwIBAgIIWlEJlMJWrcgwDQYJKoZIhvcNAQENBQAwMzEVMBMGA1UEAwwMQ29tcHV0
YWRvcmVzMQ0wCwYDVQQKDARBRklQMQswCQYDVQQGEwJBUjAeFw0yNjExMDYxMzU4MDJaFw0yODEx
MDUxMzU4MDJaMDAxEzARBgNVBAMMCmFyaWRvc21vbm8xGTAXBgNVBAUTEENVSVQgMjAxNDg0OTkx
NTMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCcN5WcBZ+HGWGegsH3F366VSNchLwU
aMkADq9uII0fM4G9oVH1Y+rfEQ48jxEm9SVneQBNgxVXWroj14EZbC05IVRFz8UKYmwYLWIlo6qM
h+x2THGCJAlV/ZEzp657YOCziGsMqqd/bTAHAqKFqbbNfqCD0nDcZBNMEuoXpy3yVn4kp9oUjj6S
y19WxFKTDyevKlalwAspg0zBjMqz7V9RfMAwQnsWA+XJxa9JeqMXSUHkjj2lxckdkkNNDbQfDr3j
Rxms1IKMMqAQss5iWyf3DJW8BjYgeJ4uGp3hPrfX0Da+MFAQBv7IK9VqOaYsCvemw0EQCxEUiPuC
nfx7S/w1AgMBAAGjYDBeMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUKw0vyN9h/QjJThHQNZME
bY5b0G4wHQYDVR0OBBYEFDA6kVEBISNwaiiTXG3uCuDZ6Y/6MA4GA1UdDwEB/wQEAwIF4DANBgkq
hkiG9w0BAQ0FAAOCAQEACkNGvtaiBmY4ANNI8Nj05AaA/e9f0HmhrKNL+3MTwRrcuwaoyZlzW90V
7Bh3+KtCDmasN5Nu50MFu03hd5gXEWOsqR63HGIBIlxKBpTLpbUDbU45KjpOdfxZPFVDgOvNF/9p
N5UbllN2s+obhBFStbDHU7l1i1w6cT1BM18yqsZbrTLSXOl7xE2KuxWSjoOtrCZ6tdusqH2Ongzb
SMpUvBuQpcwimEaiqx21qIqchEi+YZI4Yq1+onQJk1IThRhtIMAeuSaxC94SVzqDCZK0LhkGEENC
0dCqxW7WYDrSGyrlEGPWYdO+U2Aq55w793AkJJsYe8SirucDwioxOMDlFA==
-----END CERTIFICATE-----', '2028-11-05')
on conflict (key) do update set cuit = excluded.cuit, name = excluded.name, cert = excluded.cert, cert_expires = excluded.cert_expires, updated_at = now();

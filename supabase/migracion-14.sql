-- Espacio para los PDF que se mandan por WhatsApp (link público con nombre al azar).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('documentos','documentos',true,10485760,array['application/pdf']) on conflict (id) do nothing;
create policy "subir documentos" on storage.objects for insert to authenticated with check (bucket_id = 'documentos');

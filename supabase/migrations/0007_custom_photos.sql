-- Fotos personalizadas: a equipe escreve a cena de uma foto do kit e pode salvar para reusar.

-- O texto fica na própria foto, para refazer depois mesmo que o tipo salvo seja apagado.
alter table public.kit_photos
  add column custom_label text,
  add column custom_prompt text;

-- Tipos personalizados salvos: a equipe toda vê; edita e apaga quem criou ou o admin.
create table public.custom_photo_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  prompt text not null check (length(btrim(prompt)) between 1 and 600),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.custom_photo_types enable row level security;

create policy custom_photo_types_select on public.custom_photo_types for select to authenticated using (true);
create policy custom_photo_types_insert on public.custom_photo_types for insert to authenticated
  with check (created_by = auth.uid());
create policy custom_photo_types_update on public.custom_photo_types for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy custom_photo_types_delete on public.custom_photo_types for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

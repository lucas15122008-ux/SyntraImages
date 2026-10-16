-- SyntraImages: esquema inicial. Rodar no SQL Editor do Supabase ou com `supabase db push`.

-- ───────────── Perfis ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member'))
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Todo usuário novo (convidado) ganha um perfil de membro.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Kits ─────────────
create table public.kits (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_name text not null,
  car_model text,
  car_year text,
  config jsonb not null,
  original_path text not null,
  extra_reference_path text,
  created_at timestamptz not null default now()
);
create index kits_owner_idx on public.kits (owner, created_at desc);

create table public.kit_photos (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits (id) on delete cascade,
  position int not null check (position >= 1),
  kind text not null check (kind in ('cover', 'generated', 'fixed')),
  type text,
  status text not null default 'pending' check (status in ('pending', 'generating', 'done', 'failed')),
  storage_path text,
  warn_missing_angle boolean not null default false,
  warn_dismissed boolean not null default false,
  attempts int not null default 0,
  error text,
  generated_at timestamptz,
  unique (kit_id, position)
);

create table public.kit_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  config jsonb not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.store_assets (
  slot int primary key check (slot in (0, 1)),
  storage_path text not null
);

-- ───────────── RLS ─────────────
alter table public.profiles enable row level security;
alter table public.kits enable row level security;
alter table public.kit_photos enable row level security;
alter table public.kit_templates enable row level security;
alter table public.store_assets enable row level security;

-- Perfis: cada um lê o seu; admin lê todos. Ninguém altera pelo cliente (só a chave de serviço).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Kits e fotos: só da própria conta.
create policy kits_own on public.kits for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy kit_photos_own on public.kit_photos for all to authenticated
  using (exists (select 1 from public.kits k where k.id = kit_id and k.owner = auth.uid()))
  with check (exists (select 1 from public.kits k where k.id = kit_id and k.owner = auth.uid()));

-- Modelos de kit: a equipe toda vê; edita quem criou ou o admin.
create policy kit_templates_select on public.kit_templates for select to authenticated using (true);
create policy kit_templates_insert on public.kit_templates for insert to authenticated
  with check (created_by = auth.uid());
create policy kit_templates_update on public.kit_templates for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy kit_templates_delete on public.kit_templates for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- Artes da loja: todos leem; só o admin grava.
create policy store_assets_select on public.store_assets for select to authenticated using (true);
create policy store_assets_admin_write on public.store_assets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────────── Storage (buckets privados) ─────────────
insert into storage.buckets (id, name, public) values
  ('originals', 'originals', false),
  ('generated', 'generated', false),
  ('store', 'store', false)
on conflict (id) do nothing;

-- originals/generated: arquivos em "<id do usuário>/...", acessíveis só pelo dono.
create policy originals_own on storage.objects for all to authenticated
  using (bucket_id = 'originals' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'originals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy generated_own on storage.objects for all to authenticated
  using (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text);

-- store: todos leem, só o admin grava.
create policy store_read on storage.objects for select to authenticated
  using (bucket_id = 'store');
create policy store_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'store' and public.is_admin())
  with check (bucket_id = 'store' and public.is_admin());

-- Foto x venda: em que dia cada anúncio do ML passou a usar as fotos do Syntra.

create table public.photo_switches (
  id uuid primary key default gen_random_uuid(),
  ml_item_id text not null check (ml_item_id ~ '^MLB[0-9]+$'),
  switched_on date not null,
  kit_id uuid references public.kits (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ml_item_id, switched_on)
);
create index photo_switches_kit_idx on public.photo_switches (kit_id);

-- Sem nenhuma política: só a chave de serviço (servidor) lê e grava, depois de conferir quem pede.
alter table public.photo_switches enable row level security;

-- Chaves de acesso da API de fotos (e do servidor MCP). Rodar no SQL Editor do Supabase.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  -- Os kits criados com a chave ficam na conta de quem a criou.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Só o hash SHA-256 fica guardado; a chave aparece uma única vez, ao ser criada.
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id, created_at desc);

-- Sem nenhuma política: só a chave de serviço (servidor) lê e grava.
alter table public.api_keys enable row level security;

-- Conexão com a conta do Mercado Livre da loja (uma só para a equipe toda).
-- Os tokens ficam criptografados pelo servidor (ML_TOKEN_KEY) antes de chegar aqui.

create table public.ml_connection (
  id int primary key default 1 check (id = 1),
  ml_user_id bigint not null,
  nickname text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scope text,
  -- Enquanto um servidor renova o token, os outros esperam (o refresh token do ML só vale uma vez).
  refreshing_until timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sem nenhuma política: só a chave de serviço (servidor) lê e grava. O navegador nunca vê os tokens.
alter table public.ml_connection enable row level security;

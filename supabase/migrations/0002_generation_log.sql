-- Teto diário de gerações (toda a equipe) e recuperação de gerações travadas.

create table public.generation_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kit_id uuid,
  position int,
  created_at timestamptz not null default now()
);
create index generation_log_created_idx on public.generation_log (created_at);

-- Sem nenhuma política: só a chave de serviço (servidor) lê e grava.
alter table public.generation_log enable row level security;

-- Quando a foto entrou em "generating"; passado o prazo, outra chamada pode reassumir.
alter table public.kit_photos add column generating_since timestamptz;

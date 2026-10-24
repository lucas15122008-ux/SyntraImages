-- Custo de cada anúncio do Mercado Livre, usado pelo simulador de promoções.
-- Preenchido pelo administrador na tela; vale para a equipe toda.

create table public.ml_item_costs (
  item_id text primary key check (item_id ~ '^MLB[0-9]+$'),
  cost numeric(12, 2) not null check (cost >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ml_item_costs enable row level security;

create policy ml_item_costs_admin on public.ml_item_costs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

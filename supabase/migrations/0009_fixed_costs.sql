-- Custos fixos mensais da loja (aluguel, contador, sistemas...), usados na tela Lucro da Loja.
-- Cada custo vale a partir de "since" e, se foi encerrado, até "until" (dias de Brasília).
-- No período, o valor mensal é rateado por dia: cada dia vale valor ÷ dias daquele mês.

create table public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  description text not null check (length(trim(description)) between 1 and 80),
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  since date not null,
  until date check (until is null or until >= since),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.fixed_costs enable row level security;

create policy fixed_costs_admin on public.fixed_costs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

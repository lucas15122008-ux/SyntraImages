-- Meta de faturamento do mês (vendas brutas do Mercado Livre). Uma linha por mês, só o admin vê e grava.

create table public.revenue_goals (
  -- Primeiro dia do mês (horário de Brasília).
  month date primary key check (extract(day from month) = 1),
  amount numeric(12, 2) not null check (amount > 0),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.revenue_goals enable row level security;

create policy revenue_goals_admin on public.revenue_goals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

import Link from 'next/link';
import { DailyChart } from '@/components/revenue/DailyChart';
import { Delta, Kpi, PERIOD_LABEL } from '@/components/revenue/Kpi';
import { PeriodTabs, ShareBar, Stagger, StaggerRow, StaggerRows } from '@/components/revenue/RevenueMotion';
import { count, dayLabel, money, percent } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { fetchOrders, PERIODS, periodRanges, summarizeRevenue, type Period, type Revenue, type SearchPage } from '@/lib/ml/revenue';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Faturamento' };

async function load(sellerId: number, days: Period): Promise<{ now: Revenue; before: Revenue }> {
  const { current, previous } = periodRanges(days);
  const get = (path: string) => mlGet<SearchPage>(path);
  const [a, b] = await Promise.all([fetchOrders(sellerId, current, get), fetchOrders(sellerId, previous, get)]);
  return { now: summarizeRevenue(a, current), before: summarizeRevenue(b, previous) };
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (
    <div className="page-head">
      <div>
        <h1>Faturamento</h1>
        <p className="sub">Vendas no Mercado Livre pelo dia em que o pedido foi feito, contadas como no painel do ML (horário de Brasília).</p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador vê o faturamento.
        </p>
      </main>
    );
  }

  const dias = Number((await searchParams).dias);
  const days: Period = PERIODS.includes(dias as Period) ? (dias as Period) : 30;
  const connection = await getConnectionStatus();
  if (!connection) {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="alert" size={16} /> A conta do Mercado Livre não está conectada. <Link href="/configuracoes/mercado-livre">Conectar agora</Link>
        </p>
      </main>
    );
  }

  let data: { now: Revenue; before: Revenue } | null = null;
  let error: string | null = null;
  try {
    data = await load(connection.mlUserId, days);
  } catch (e) {
    error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar os pedidos no Mercado Livre agora. Tente de novo em instantes.';
    console.error('[ml] faturamento', e instanceof Error ? e.message : e);
  }

  return (
    <main className="settings-page revenue">
      {head}
      <PeriodTabs items={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} current={days} basePath="/faturamento" />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <Stagger className="kpis" label="Resumo">
            <Kpi hero label="Vendas brutas" value={data.now.gross} format="money">
              <Delta now={data.now.gross} before={data.before.gross} />
            </Kpi>
            <Kpi label="Quantidade de vendas" value={data.now.sales} format="count">
              <Delta now={data.now.sales} before={data.before.sales} />
            </Kpi>
            <Kpi label="Unidades vendidas" value={data.now.units} format="count">
              <Delta now={data.now.units} before={data.before.units} />
            </Kpi>
            <Kpi label="Preço médio por venda" value={data.now.avgTicket} format="money">
              <Delta now={data.now.avgTicket} before={data.before.avgTicket} />
            </Kpi>
            <Kpi label="Preço médio por unidade" value={data.now.avgUnitPrice} format="money">
              <Delta now={data.now.avgUnitPrice} before={data.before.avgUnitPrice} />
            </Kpi>
            <Kpi label="Vendas canceladas" value={data.now.cancelled.sales} format="count">
              <span className="delta muted">{money(data.now.cancelled.amount)}</span>
              <Delta now={data.now.cancelled.sales} before={data.before.cancelled.sales} invert />
            </Kpi>
            <Kpi label="Vendas pagas" value={data.now.paid} format="money">
              <span className="delta muted">vendas brutas sem as canceladas</span>
            </Kpi>
            <Kpi label="Tarifas de venda do ML" value={data.now.fees} format="money">
              <span className="delta">{data.now.paid ? `${percent(data.now.fees / data.now.paid).replace('+', '')} das vendas pagas` : ' '}</span>
            </Kpi>
            <Kpi label="Pagas menos tarifas" value={data.now.net} format="money">
              <span className="delta muted">sem frete, impostos e custo do produto</span>
            </Kpi>
          </Stagger>

          {days > 1 && (
            <section className="panel">
              <div className="head">
                <h2>Faturamento por dia</h2>
              </div>
              <DailyChart data={data.now.daily} />
              <details>
                <summary>Ver em tabela</summary>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Vendas</th>
                      <th>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.now.daily.map((d) => (
                      <tr key={d.day}>
                        <td>{dayLabel(d.day)}</td>
                        <td>{count(d.sales)}</td>
                        <td>{money(d.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          )}

          <section className="panel">
            <div className="head">
              <h2>Anúncios que mais faturaram</h2>
            </div>
            {data.now.top.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th>Unidades</th>
                    <th>Faturamento</th>
                  </tr>
                </thead>
                <StaggerRows>
                  {data.now.top.map((t, i) => (
                    <StaggerRow key={t.itemId}>
                      <td>
                        <span className="title">{t.title}</span>
                        <span className="muted"> {t.itemId}</span>
                        <ShareBar share={t.gross / data.now.top[0].gross} index={i} />
                      </td>
                      <td>{count(t.units)}</td>
                      <td>{money(t.gross)}</td>
                    </StaggerRow>
                  ))}
                </StaggerRows>
              </table>
            ) : (
              <p className="sub">Nenhuma venda paga neste período.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

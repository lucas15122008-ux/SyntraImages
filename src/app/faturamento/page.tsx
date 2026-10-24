import Link from 'next/link';
import { DailyChart } from '@/components/revenue/DailyChart';
import { count, dayLabel, money, percent } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { change, fetchOrders, PERIODS, periodRanges, summarizeRevenue, type Period, type Revenue, type SearchPage } from '@/lib/ml/revenue';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Faturamento' };

const PERIOD_LABEL: Record<Period, string> = { 1: 'Hoje', 7: '7 dias', 30: '30 dias', 90: '90 dias' };

async function load(sellerId: number, days: Period): Promise<{ now: Revenue; before: Revenue }> {
  const { current, previous } = periodRanges(days);
  const get = (path: string) => mlGet<SearchPage>(path);
  const [a, b] = await Promise.all([fetchOrders(sellerId, current, get), fetchOrders(sellerId, previous, get)]);
  return { now: summarizeRevenue(a, current), before: summarizeRevenue(b, previous) };
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const c = change(now, before);
  if (c === null) return <span className="delta">sem base para comparar</span>;
  const good = invert ? c < 0 : c > 0;
  return (
    <span className={`delta ${c === 0 ? '' : good ? 'up' : 'down'}`}>
      {percent(c)} <span className="muted">vs. período anterior</span>
    </span>
  );
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (
    <div className="page-head">
      <div>
        <h1>Faturamento</h1>
        <p className="sub">Vendas pagas no Mercado Livre, pelo dia em que o pedido foi feito (horário de Brasília).</p>
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
      <nav className="segmented" aria-label="Período">
        {PERIODS.map((p) => (
          <Link key={p} href={`/faturamento?dias=${p}`} aria-current={p === days ? 'page' : undefined}>
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </nav>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <section className="kpis" aria-label="Resumo">
            <div className="kpi panel hero">
              <span className="label">Faturamento bruto</span>
              <strong>{money(data.now.gross)}</strong>
              <Delta now={data.now.gross} before={data.before.gross} />
            </div>
            <div className="kpi panel">
              <span className="label">Vendas</span>
              <strong>{count(data.now.sales)}</strong>
              <Delta now={data.now.sales} before={data.before.sales} />
            </div>
            <div className="kpi panel">
              <span className="label">Ticket médio</span>
              <strong>{money(data.now.avgTicket)}</strong>
              <Delta now={data.now.avgTicket} before={data.before.avgTicket} />
            </div>
            <div className="kpi panel">
              <span className="label">Unidades vendidas</span>
              <strong>{count(data.now.units)}</strong>
              <Delta now={data.now.units} before={data.before.units} />
            </div>
            <div className="kpi panel">
              <span className="label">Tarifas de venda do ML</span>
              <strong>{money(data.now.fees)}</strong>
              <span className="delta">{data.now.gross ? `${percent(data.now.fees / data.now.gross).replace('+', '')} do bruto` : ' '}</span>
            </div>
            <div className="kpi panel">
              <span className="label">Bruto menos tarifas</span>
              <strong>{money(data.now.net)}</strong>
              <span className="delta muted">sem frete, impostos e custo do produto</span>
            </div>
            <div className="kpi panel">
              <span className="label">Canceladas</span>
              <strong>{count(data.now.cancelled.sales)}</strong>
              <span className="delta muted">{money(data.now.cancelled.amount)}</span>
            </div>
          </section>

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
                <tbody>
                  {data.now.top.map((t) => (
                    <tr key={t.itemId}>
                      <td>
                        <span className="title">{t.title}</span>
                        <span className="muted"> {t.itemId}</span>
                      </td>
                      <td>{count(t.units)}</td>
                      <td>{money(t.gross)}</td>
                    </tr>
                  ))}
                </tbody>
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

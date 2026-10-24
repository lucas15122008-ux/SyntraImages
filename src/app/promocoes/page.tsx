import Link from 'next/link';
import { Delta, Kpi, PERIOD_LABEL } from '@/components/revenue/Kpi';
import { PeriodTabs, ShareBar, Stagger, StaggerRow, StaggerRows } from '@/components/revenue/RevenueMotion';
import { count, money } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { fetchPromotions, summarizeDiscounts, type DiscountSummary, type PromoOrder, type PromotionRow } from '@/lib/ml/promotions';
import { fetchOrders, PERIODS, periodRanges, type Period, type SearchPage } from '@/lib/ml/revenue';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Promoções' };

type Data = { now: DiscountSummary; before: DiscountSummary; promotions: PromotionRow[] | null };

async function load(sellerId: number, days: Period): Promise<Data> {
  const { current, previous } = periodRanges(days);
  const get = (path: string) => mlGet<SearchPage>(path);
  const [a, b, promotions] = await Promise.all([
    fetchOrders(sellerId, current, get),
    fetchOrders(sellerId, previous, get),
    // Se a lista de campanhas falhar, o resto da tela continua.
    fetchPromotions(sellerId, (path) => mlGet(path)).catch((e) => {
      console.error('[ml] promoções', e instanceof Error ? e.message : e);
      return null;
    }),
  ]);
  return { now: summarizeDiscounts(a as PromoOrder[]), before: summarizeDiscounts(b as PromoOrder[]), promotions };
}

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function when(p: PromotionRow): string {
  if (p.status === 'pending') return p.start ? `começa em ${shortDate.format(new Date(p.start))}` : 'agendada';
  return p.finish ? `até ${shortDate.format(new Date(p.finish))}` : 'sem data para acabar';
}

function reach(p: PromotionRow): string {
  if (p.coupon) {
    const used = p.coupon.used === null ? '' : `${count(p.coupon.used)} ${p.coupon.used === 1 ? 'usado' : 'usados'}`;
    const left = p.coupon.remaining === null ? '' : `${money(p.coupon.remaining)} de verba restante`;
    return [used, left].filter(Boolean).join(' · ') || '—';
  }
  if (p.activeItems === null) return '—';
  return `${count(p.activeItems)} ${p.activeItems === 1 ? 'anúncio' : 'anúncios'}`;
}

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (
    <div className="page-head">
      <div>
        <h1>Promoções</h1>
        <p className="sub">Quanto das vendas pagas saiu com desconto, quanto de desconto foi dado e quais campanhas estão no ar no Mercado Livre.</p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador vê as promoções.
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

  let data: Data | null = null;
  let error: string | null = null;
  try {
    data = await load(connection.mlUserId, days);
  } catch (e) {
    error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar os dados no Mercado Livre agora. Tente de novo em instantes.';
    console.error('[ml] promoções', e instanceof Error ? e.message : e);
  }

  return (
    <main className="settings-page revenue">
      {head}
      <PeriodTabs items={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} current={days} basePath="/promocoes" />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <Stagger className="kpis" label="Resumo">
            <Kpi hero label="Vendas com desconto" value={data.now.withDiscount.gross} format="money">
              <Delta now={data.now.withDiscount.gross} before={data.before.withDiscount.gross} />
            </Kpi>
            <Kpi label="Parte das vendas com desconto" value={data.now.share} format="share">
              <span className="delta muted">do valor das vendas pagas</span>
            </Kpi>
            <Kpi label="Quantidade com desconto" value={data.now.withDiscount.sales} format="count">
              <Delta now={data.now.withDiscount.sales} before={data.before.withDiscount.sales} />
            </Kpi>
            <Kpi label="Desconto dado" value={data.now.discountGiven} format="money">
              <span className="delta muted">preço cheio menos o preço vendido</span>
            </Kpi>
            <Kpi label="Preço médio com desconto" value={data.now.withDiscount.avgTicket} format="money">
              <span className="delta muted">por venda</span>
            </Kpi>
            <Kpi label="Preço médio sem desconto" value={data.now.withoutDiscount.avgTicket} format="money">
              <span className="delta muted">por venda</span>
            </Kpi>
          </Stagger>

          <section className="panel">
            <div className="head">
              <h2>Campanhas no ar e agendadas</h2>
            </div>
            {data.promotions === null ? (
              <p className="sub">Não foi possível ler as campanhas agora.</p>
            ) : data.promotions.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Quando</th>
                    <th>Participação</th>
                  </tr>
                </thead>
                <StaggerRows>
                  {data.promotions.map((p) => (
                    <StaggerRow key={p.id}>
                      <td>
                        <span className="title">{p.name}</span>
                        <span className="muted">
                          {' '}
                          {p.kind}
                          {p.coupon ? ` · ${p.coupon.label}` : ''}
                        </span>
                        {p.status === 'pending' && <span className="pill promo-pill">agendada</span>}
                      </td>
                      <td>{when(p)}</td>
                      <td>{reach(p)}</td>
                    </StaggerRow>
                  ))}
                </StaggerRows>
              </table>
            ) : (
              <p className="sub">Nenhuma campanha no ar.</p>
            )}
          </section>

          <section className="panel">
            <div className="head">
              <h2>Anúncios que mais venderam com desconto</h2>
            </div>
            {data.now.top.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th>Unidades</th>
                    <th>Desconto dado</th>
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
                      <td>{money(t.discount)}</td>
                      <td>{money(t.gross)}</td>
                    </StaggerRow>
                  ))}
                </StaggerRows>
              </table>
            ) : (
              <p className="sub">Nenhuma venda com desconto neste período.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

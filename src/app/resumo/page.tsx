import Link from 'next/link';
import { MonthGoal } from '@/components/revenue/MonthGoal';
import { Delta, Kpi } from '@/components/revenue/Kpi';
import { Stagger } from '@/components/revenue/RevenueMotion';
import { count, money } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { dailyLimit, startOfDayBR } from '@/lib/kit/generate';
import { summarizeKit, type KitSummary, type PhotoRow } from '@/lib/kit/summary';
import { goalProgress, monthKey, monthName, type GoalProgress } from '@/lib/ml/goal';
import { getRevenueGoal } from '@/lib/ml/goal-actions';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { fetchOrders, type SearchPage } from '@/lib/ml/revenue';
import { kitsNeedingAttention, overviewRanges, summarizeSales, type SalesOverview } from '@/lib/overview/overview';
import { getSupabaseAdmin, getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Resumo' };

type Kit = { id: string; name: string; car: string; createdAt: string; summary: KitSummary };

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function statePill(s: KitSummary) {
  if (s.state === 'attention') return <span className="pill bad">{s.failed === 1 ? '1 falhou' : `${s.failed} falharam`}</span>;
  if (s.state === 'ready') return <span className="pill ok">pronto</span>;
  return <span className="pill gen num">{s.ready} de {s.total}</span>;
}

async function loadKits(): Promise<Kit[]> {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from('kits')
    .select('id, product_name, car_model, car_year, created_at, kit_photos(position, kind, status, storage_path, warn_missing_angle, warn_dismissed)')
    .order('created_at', { ascending: false })
    .limit(30);
  return (data ?? []).map((k) => ({
    id: k.id,
    name: k.product_name,
    car: [k.car_model, k.car_year].filter(Boolean).join(' '),
    createdAt: k.created_at,
    summary: summarizeKit((k.kit_photos ?? []) as PhotoRow[]),
  }));
}

/** Gerações de foto da equipe hoje; null se não der para contar (a tela segue sem o número). */
async function generationsToday(since: Date): Promise<number | null> {
  try {
    const { count: n, error } = await getSupabaseAdmin()
      .from('generation_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since.toISOString());
    if (error) throw error;
    return n ?? 0;
  } catch (e) {
    console.error('[resumo] gerações do dia', e instanceof Error ? e.message : e);
    return null;
  }
}

type Sales = { connected: false } | { connected: true; data: SalesOverview | null; goal: GoalProgress | null | undefined; error: string | null };

/** Vendas de hoje, da semana e do mês numa busca só de pedidos. A meta some (undefined) se não der para ler. */
async function loadSales(): Promise<Sales> {
  const connection = await getConnectionStatus();
  if (!connection) return { connected: false };
  const now = new Date();
  const ranges = overviewRanges(now);
  try {
    const [orders, goal] = await Promise.all([
      fetchOrders(connection.mlUserId, ranges.fetch, (path) => mlGet<SearchPage>(path)),
      getRevenueGoal().catch((e) => {
        console.error('[resumo] meta do mês', e instanceof Error ? e.message : e);
        return undefined;
      }),
    ]);
    const data = summarizeSales(orders, ranges);
    return { connected: true, data, goal: goal == null ? goal : goalProgress(goal, data.month, now), error: null };
  } catch (e) {
    console.error('[resumo] vendas', e instanceof Error ? e.message : e);
    const error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar as vendas no Mercado Livre agora. Tente de novo em instantes.';
    return { connected: true, data: null, goal: undefined, error };
  }
}

export default async function OverviewPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const dayStart = startOfDayBR(new Date());
  const [kits, generated, sales] = await Promise.all([loadKits(), generationsToday(dayStart), isAdmin ? loadSales() : Promise.resolve(null)]);
  const attention = kitsNeedingAttention(kits);
  const kitsToday = kits.filter((k) => new Date(k.createdAt) >= dayStart).length;
  const limit = dailyLimit();

  return (
    <main className="settings-page revenue overview">
      <div className="page-head">
        <div>
          <h1>Resumo</h1>
          <p className="sub">O essencial do Syntra numa tela só. Toque num bloco para abrir a página completa.</p>
        </div>
      </div>

      {sales && <SalesBlock sales={sales} />}

      <section className="overview-block" aria-labelledby="ov-fotos">
        <div className="head">
          <h2 id="ov-fotos">Fotos</h2>
          <Link className="btn ghost" href="/kits/novo">
            <Icon name="plus" size={14} /> Novo kit
          </Link>
        </div>
        <Stagger className="kpis" label="Fotos hoje">
          <Kpi label="Fotos geradas hoje" value={generated ?? 0} format="count">
            <span className="delta muted">{generated === null ? 'não foi possível contar agora' : `de ${count(limit)} por dia para a equipe`}</span>
          </Kpi>
          <Kpi label="Kits criados hoje" value={kitsToday} format="count">
            <span className="delta muted">{kits.length ? `último em ${dateFmt.format(new Date(kits[0].createdAt))}` : 'nenhum kit ainda'}</span>
          </Kpi>
          <Kpi label="Kits pedindo atenção" value={attention.length} format="count">
            <span className={`delta ${attention.length ? 'down' : 'up'}`}>{attention.length ? 'fotos com falha ou aviso' : 'tudo certo'}</span>
          </Kpi>
        </Stagger>

        {attention.length > 0 && (
          <section className="panel">
            <div className="head">
              <h3>Para revisar</h3>
            </div>
            <ul className="overview-list">
              {attention.slice(0, 5).map(({ kit, reason }) => (
                <li key={kit.id}>
                  <Link href={`/kits/${kit.id}`}>
                    <span className="title">{kit.name}</span>
                    {kit.car && <span className="muted"> · {kit.car}</span>}
                  </Link>
                  <span className="pill warn">{reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {kits.length > 0 && (
          <section className="panel">
            <div className="head">
              <h3>Últimos kits</h3>
              <Link className="btn ghost" href="/">
                Ver todos
              </Link>
            </div>
            <ul className="overview-list">
              {kits.slice(0, 5).map((k) => (
                <li key={k.id}>
                  <Link href={`/kits/${k.id}`}>
                    <span className="title">{k.name}</span>
                    <span className="muted"> · {dateFmt.format(new Date(k.createdAt))}</span>
                  </Link>
                  {statePill(k.summary)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}

function SalesBlock({ sales }: { sales: Sales }) {
  const head = (
    <div className="head">
      <h2 id="ov-vendas">Vendas no Mercado Livre</h2>
      <Link className="btn ghost" href="/faturamento">
        Ver faturamento
      </Link>
    </div>
  );

  if (!sales.connected) {
    return (
      <section className="overview-block" aria-labelledby="ov-vendas">
        {head}
        <p className="alert" role="note">
          <Icon name="alert" size={16} /> A conta do Mercado Livre não está conectada. <Link href="/configuracoes/mercado-livre">Conectar agora</Link>
        </p>
      </section>
    );
  }

  const { data, goal, error } = sales;
  return (
    <section className="overview-block" aria-labelledby="ov-vendas">
      {head}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <Stagger className="kpis" label="Vendas">
          <Kpi hero label="Vendas brutas hoje" value={data.today.gross} format="money">
            <Delta now={data.today.gross} before={data.yesterday.gross} versus="vs. ontem até esta hora" />
          </Kpi>
          <Kpi label="Vendas hoje" value={data.today.sales} format="count">
            <Delta now={data.today.sales} before={data.yesterday.sales} versus="vs. ontem até esta hora" />
          </Kpi>
          <Kpi label="Vendas brutas em 7 dias" value={data.week.gross} format="money">
            <Delta now={data.week.gross} before={data.prevWeek.gross} versus="vs. 7 dias anteriores" />
          </Kpi>
          <Kpi label="Vendas em 7 dias" value={data.week.sales} format="count">
            <Delta now={data.week.sales} before={data.prevWeek.sales} versus="vs. 7 dias anteriores" />
          </Kpi>
        </Stagger>
      )}

      {goal ? (
        <MonthGoal month={monthName(monthKey())} progress={goal} />
      ) : (
        goal === null && (
          <p className="sub">
            Sem meta para {monthName(monthKey())}. <Link href="/faturamento">Definir a meta do mês</Link>
          </p>
        )
      )}

      {data && data.week.top.length > 0 && (
        <section className="panel">
          <div className="head">
            <h3>Mais vendidos em 7 dias</h3>
          </div>
          <ul className="overview-list">
            {data.week.top.map((t) => (
              <li key={t.itemId}>
                <span className="title">{t.title}</span>
                <span className="muted num">
                  {count(t.units)} {t.units === 1 ? 'unidade' : 'unidades'} · {money(t.gross)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

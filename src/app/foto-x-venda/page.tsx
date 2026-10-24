import Link from 'next/link';
import { PublishForm, RemoveSwitch } from '@/components/impact/PublishForm';
import { Kpi } from '@/components/revenue/Kpi';
import { Stagger, StaggerRow, StaggerRows } from '@/components/revenue/RevenueMotion';
import { change } from '@/lib/ml/revenue';
import { count, dayLabel, money, percent } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { getConnectionStatus } from '@/lib/ml/connection';
import { MAX_WINDOW_DAYS, MIN_VISITS, MIN_WINDOW_DAYS, totalImpact, type Impact, type Side, type Verdict } from '@/lib/ml/photo-impact';
import { fetchItems, listSwitches, loadImpact, type ItemInfo, type PhotoSwitch } from '@/lib/ml/photo-switches';
import { brtDay } from '@/lib/ml/revenue';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Foto x venda' };

type Row = { s: PhotoSwitch; item: ItemInfo | null; impact: Impact | null };

async function load(sellerId: number, switches: PhotoSwitch[], today: string): Promise<Row[]> {
  const items = await fetchItems(switches.map((s) => s.ml_item_id)).catch((e) => {
    console.error('[ml] foto x venda: anúncios', e instanceof Error ? e.message : e);
    return new Map<string, ItemInfo>();
  });
  const rows: Row[] = [];
  // Poucos anúncios por vez: cada um faz algumas chamadas ao ML.
  for (let i = 0; i < switches.length; i += 3) {
    const batch = await Promise.all(
      switches.slice(i, i + 3).map(async (s) => ({
        s,
        item: items.get(s.ml_item_id) ?? null,
        impact: await loadImpact(sellerId, s, today).catch((e) => {
          console.error('[ml] foto x venda', s.ml_item_id, e instanceof Error ? e.message : e);
          return null;
        }),
      })),
    );
    rows.push(...batch);
  }
  return rows;
}

const conv = (s: Side) => (s.conversion === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(s.conversion));

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  up: { label: 'Melhorou', className: 'pill ok' },
  down: { label: 'Piorou', className: 'pill bad' },
  same: { label: 'Sem diferença clara', className: 'pill' },
  little_data: { label: 'Poucas visitas', className: 'pill warn' },
  waiting: { label: 'Aguardando dias', className: 'pill gen' },
};

function Change({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return null;
  const c = change(now, before);
  if (c === null) return null;
  return <span className={`delta ${c === 0 ? '' : c > 0 ? 'up' : 'down'}`}> {percent(c)}</span>;
}

function Pair({ before, after, format }: { before: number; after: number; format: (n: number) => string }) {
  return (
    <>
      <span className="from">antes {format(before)}</span>
      {format(after)}
      <Change now={after} before={before} />
    </>
  );
}

export default async function PhotoImpactPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  const today = brtDay(new Date());

  const head = (
    <div className="page-head">
      <div>
        <h1>Foto x venda</h1>
        <p className="sub">
          Visitas, vendas e conversão de cada anúncio antes e depois de receber as fotos do Syntra, em períodos do mesmo tamanho (até {MAX_WINDOW_DAYS} dias de cada lado,
          sem o dia da troca).
        </p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador vê a comparação. Para registrar uma troca, use o botão no fim da tela do kit.
        </p>
      </main>
    );
  }

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

  let rows: Row[] = [];
  let error: string | null = null;
  try {
    rows = await load(connection.mlUserId, await listSwitches(), today);
  } catch (e) {
    error = 'Não foi possível montar a comparação agora. Tente de novo em instantes.';
    console.error('[ml] foto x venda', e instanceof Error ? e.message : e);
  }
  const impacts = rows.flatMap((r) => (r.impact ? [r.impact] : []));
  const total = totalImpact(impacts);

  return (
    <main className="settings-page revenue">
      {head}

      <section className="panel">
        <div className="head">
          <h2>Registrar uma troca de fotos</h2>
        </div>
        <p className="sub">Cole o código ou o link do anúncio e o dia em que as fotos do Syntra entraram no ar. Também dá para registrar na tela do kit.</p>
        <PublishForm today={today} />
      </section>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {total.listings > 0 && (
        <Stagger className="kpis" label="Resumo">
          <Kpi hero label="Conversão depois das fotos" value={total.after.conversion ?? 0} format="share">
            <span className="delta">
              antes {conv(total.before)}
              <Change now={total.after.conversion} before={total.before.conversion} />
            </span>
          </Kpi>
          <Kpi label="Vendas depois" value={total.after.sales} format="count">
            <span className="delta">
              antes {count(total.before.sales)}
              <Change now={total.after.sales} before={total.before.sales} />
            </span>
          </Kpi>
          <Kpi label="Visitas depois" value={total.after.visits} format="count">
            <span className="delta">
              antes {count(total.before.visits)}
              <Change now={total.after.visits} before={total.before.visits} />
            </span>
          </Kpi>
          <Kpi label="Faturamento depois" value={total.after.gross} format="money">
            <span className="delta">
              antes {money(total.before.gross)}
              <Change now={total.after.gross} before={total.before.gross} />
            </span>
          </Kpi>
          <Kpi label="Anúncios comparados" value={total.listings} format="count">
            <span className="delta">
              {total.improved} melhoraram · {total.worsened} pioraram
            </span>
          </Kpi>
        </Stagger>
      )}

      <section className="panel">
        <div className="head">
          <h2>Anúncios</h2>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table impact-table">
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th>Dias</th>
                  <th>Visitas</th>
                  <th>Vendas</th>
                  <th>Conversão</th>
                  <th>Faturamento</th>
                  <th>Resultado</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <StaggerRows>
                {rows.map(({ s, item, impact }) => (
                  <StaggerRow key={s.id}>
                    <td>
                      <div className="impact-item">
                        {item?.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura do próprio ML
                          <img src={item.thumbnail} alt="" />
                        ) : (
                          <span className="img-ph" />
                        )}
                        <div>
                          <span className="title">{item?.permalink ? <a href={item.permalink} target="_blank" rel="noreferrer">{item.title}</a> : (item?.title ?? s.ml_item_id)}</span>
                          <span className="muted">
                            {s.ml_item_id} · fotos trocadas em {dayLabel(s.switched_on)}
                            {s.kit_id && (
                              <>
                                {' · '}
                                <Link href={`/kits/${s.kit_id}`}>ver kit</Link>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    {impact ? (
                      impact.days === 0 ? (
                        <td colSpan={5} className="muted">
                          Os números aparecem a partir de amanhã.
                        </td>
                      ) : (
                        <>
                          <td>{count(impact.days)}</td>
                          <td>
                            <Pair before={impact.before.visits} after={impact.after.visits} format={count} />
                          </td>
                          <td>
                            <Pair before={impact.before.sales} after={impact.after.sales} format={count} />
                          </td>
                          <td>
                            <span className="from">antes {conv(impact.before)}</span>
                            {conv(impact.after)}
                            <Change now={impact.after.conversion} before={impact.before.conversion} />
                          </td>
                          <td>
                            <Pair before={impact.before.gross} after={impact.after.gross} format={money} />
                          </td>
                        </>
                      )
                    ) : (
                      <td colSpan={5} className="muted">
                        Não foi possível buscar os números deste anúncio agora.
                      </td>
                    )}
                    <td>{impact && <span className={VERDICT[impact.verdict].className}>{VERDICT[impact.verdict].label}</span>}</td>
                    <td>
                      <div className="actions">
                        <RemoveSwitch id={s.id} label={item?.title ?? s.ml_item_id} />
                      </div>
                    </td>
                  </StaggerRow>
                ))}
              </StaggerRows>
            </table>
          </div>
        ) : (
          !error && <p className="sub">Nenhuma troca registrada ainda. Registre acima o primeiro anúncio que recebeu as fotos do Syntra.</p>
        )}
      </section>

      <p className="sub">
        Conversão é vendas pagas dividido por visitas. &quot;Melhorou&quot; ou &quot;Piorou&quot; só aparece quando a diferença é grande demais para ser acaso (90% de confiança) e cada
        período teve pelo menos {MIN_VISITS} visitas; com menos de {MIN_WINDOW_DAYS} dias, ainda aguarda. Preço, promoções, estoque e época do ano também mexem nas vendas: compare
        anúncios que não mudaram mais nada no período.
      </p>
    </main>
  );
}

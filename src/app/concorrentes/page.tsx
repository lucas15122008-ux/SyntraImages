import Link from 'next/link';
import { Suspense } from 'react';
import { count, money, share } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { radarFor, topItems, type Rival, type TopItem } from '@/lib/ml/competitors';
import { fetchOrders, periodRanges, type SearchPage } from '@/lib/ml/revenue';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Concorrentes' };

/** Quantos anúncios entram no radar: os que mais faturaram nos últimos 30 dias. */
const LISTINGS = 10;

const MEDAL: Record<string, string> = { platinum: 'Líder Platinum', gold: 'Líder Gold', silver: 'Líder' };

function gapPill(gap: number | null) {
  if (gap === null) return null;
  if (Math.abs(gap) < 0.005) return <span className="pill">mesmo preço do mais barato</span>;
  if (gap < 0) return <span className="pill ok">o mais barato</span>;
  return <span className={`pill ${gap > 0.1 ? 'bad' : 'warn'}`}>{share(gap)} mais caro que o mais barato</span>;
}

function RivalRows({ rivals }: { rivals: Rival[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Concorrente</th>
          <th>No ranking</th>
          <th>Entrega</th>
          <th>Preço</th>
        </tr>
      </thead>
      <tbody>
        {rivals.map((r) => (
          <tr key={r.itemId}>
            <td>
              <a className="title" href={r.link} target="_blank" rel="noreferrer">
                {r.seller.nickname ?? `Vendedor ${r.seller.id}`}
              </a>
              {r.seller.medal && MEDAL[r.seller.medal] && <span className="muted"> · {MEDAL[r.seller.medal]}</span>}
              {r.source === 'catalog' && <span className="pill gen promo-pill">mesmo produto</span>}
              {r.title && <span className="muted rival-title">{r.title}</span>}
            </td>
            <td>{r.position ? `${r.position}º` : '—'}</td>
            <td>{r.full ? 'Full' : r.freeShipping ? 'Frete grátis' : '—'}</td>
            <td>
              {r.originalPrice && <s className="muted">{money(r.originalPrice)}</s>} {money(r.price)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function RadarCard({ top, sellerId }: { top: TopItem; sellerId: number }) {
  let row;
  try {
    row = await radarFor(top, sellerId, (path) => mlGet(path));
  } catch (e) {
    console.error('[ml] concorrentes', top.itemId, e instanceof Error ? e.message : e);
    return (
      <section className="panel">
        <div className="head">
          <h2>{top.title}</h2>
        </div>
        <p className="sub">Não foi possível ler este anúncio no Mercado Livre agora.</p>
      </section>
    );
  }

  return (
    <section className="panel radar-card">
      <div className="head">
        <div>
          <h2>
            <a href={row.link} target="_blank" rel="noreferrer">
              {row.title}
            </a>
          </h2>
          <p className="muted">
            {row.itemId} · {count(row.units)} {row.units === 1 ? 'unidade vendida' : 'unidades vendidas'} em 30 dias · {money(row.gross)}
          </p>
        </div>
        <div className="radar-me">
          <strong>
            {row.originalPrice && <s className="muted">{money(row.originalPrice)}</s>} {money(row.price)}
          </strong>
          <span className="muted">nosso preço{row.active ? '' : ' (anúncio pausado)'}</span>
        </div>
      </div>

      <div className="radar-pills">
        <span className={`pill ${row.position ? 'ok' : ''}`}>
          {row.position ? `${row.position}º entre os mais vendidos` : 'fora dos 20 mais vendidos'}
          {row.categoryName ? ` de ${row.categoryName}` : ''}
        </span>
        {gapPill(row.gap)}
        {row.cheapest && row.gap !== null && row.gap > 0 && (
          <span className="pill">mais barato: {money(row.cheapest.price)}</span>
        )}
      </div>

      {row.rivals.length ? (
        <RivalRows rivals={row.rivals} />
      ) : row.others.length ? (
        <>
          <p className="sub">
            Nenhum dos mais vendidos da categoria parece ser a mesma peça. Os primeiros do ranking, só como referência de preço:
          </p>
          <RivalRows rivals={row.others} />
        </>
      ) : (
        <p className="sub">O Mercado Livre não mostrou concorrentes para este anúncio.</p>
      )}
    </section>
  );
}

const CardSkeleton = ({ i }: { i: number }) => (
  <div className="skeleton" style={{ height: 220, borderRadius: 22, animationDelay: `${i * 0.08}s` }} aria-hidden="true" />
);

export default async function CompetitorsPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (
    <div className="page-head">
      <div>
        <h1>Concorrentes</h1>
        <p className="sub">
          Para os {LISTINGS} anúncios que mais faturaram nos últimos 30 dias: quem vende a mesma peça, por quanto, e em que posição o nosso
          está entre os mais vendidos da categoria.
        </p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador vê os concorrentes.
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

  let tops: TopItem[] | null = null;
  let error: string | null = null;
  try {
    const orders = await fetchOrders(connection.mlUserId, periodRanges(30).current, (path) => mlGet<SearchPage>(path));
    tops = topItems(orders, LISTINGS);
  } catch (e) {
    error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar os dados no Mercado Livre agora. Tente de novo em instantes.';
    console.error('[ml] concorrentes', e instanceof Error ? e.message : e);
  }

  return (
    <main className="settings-page revenue">
      {head}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {tops && !tops.length && <p className="sub">Nenhuma venda paga nos últimos 30 dias.</p>}
      {tops?.map((t, i) => (
        <Suspense key={t.itemId} fallback={<CardSkeleton i={i} />}>
          <RadarCard top={t} sellerId={connection.mlUserId} />
        </Suspense>
      ))}
      {tops && tops.length > 0 && (
        <p className="sub radar-note">
          O Mercado Livre não libera o título de anúncios de outros vendedores; o texto abaixo do vendedor é o começo da descrição dele.
          &quot;Mesmo produto&quot; é quem vende no mesmo produto do catálogo; os outros são os mais vendidos da categoria com descrição
          parecida com o nosso título.
        </p>
      )}
    </main>
  );
}

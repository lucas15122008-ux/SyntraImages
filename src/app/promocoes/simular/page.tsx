import Link from 'next/link';
import { SimTable, type SimRowView } from '@/components/promo/SimTable';
import { Icon } from '@/components/ui/Icon';
import { count } from '@/components/revenue/format';
import { readItemCosts } from '@/lib/ml/cost-store';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { promotionKind, type MlPromotion } from '@/lib/ml/promotions';
import { fetchOrders, periodRanges, type SearchPage } from '@/lib/ml/revenue';
import {
  buildRows,
  fetchCampaignOffers,
  fetchItemOffers,
  SIMULABLE,
  unitsByItem,
  type Get,
  type Offer,
} from '@/lib/ml/simulate';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import '@/styles/simulator.css';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Simular promoção' };

type Campaign = { id: string; type: string; name: string; pending: boolean };

const get: Get = (path) => mlGet(path);

async function campaigns(sellerId: number): Promise<Campaign[]> {
  const list = await get<{ results: MlPromotion[] | null }>(`/seller-promotions/users/${sellerId}?app_version=v2`);
  return (list.results ?? [])
    .filter((p) => (p.status === 'started' || p.status === 'pending') && SIMULABLE(p.type))
    .map((p) => ({ id: p.id, type: p.type, name: p.name ?? promotionKind(p.type), pending: p.status === 'pending' }));
}

type Result = { rows: SimRowView[]; costsEnabled: boolean; total: number; next: string | null; note: string | null };

async function simulate(sellerId: number, picked: Campaign | null, itemId: string | null, after: string | null): Promise<Result | null> {
  if (!picked && !itemId) return null;
  const { current } = periodRanges(30);
  const ordersP = fetchOrders(sellerId, current, (path) => mlGet<SearchPage>(path));

  let offers: { itemId: string; offer: Offer }[] = [];
  let total = 0;
  let next: string | null = null;
  let note: string | null = null;
  if (itemId) {
    const r = await fetchItemOffers(itemId, get);
    offers = r.offers.map((offer) => ({ itemId, offer }));
    total = offers.length;
    if (r.activeName) note = `Este anúncio já está em "${r.activeName}". Entrar em outra campanha de preço tira ele dela; o "hoje" abaixo é o preço atual.`;
    if (!offers.length) note = 'Este anúncio não é candidato a nenhuma campanha de preço agora.';
  } else if (picked) {
    const page = await fetchCampaignOffers(picked, get, after);
    offers = page.offers;
    total = page.total;
    next = page.next;
  }

  const units = unitsByItem(await ordersP);
  const [rows, costs] = await Promise.all([buildRows(sellerId, offers, units, get), readItemCosts(offers.map((o) => o.itemId))]);
  return {
    rows: rows
      .map((r) => ({ ...r, cost: costs?.get(r.item.id) ?? null, kind: promotionKind(r.offer.promotionType) }))
      .sort((a, b) => b.units30 - a.units30),
    costsEnabled: costs !== null,
    total,
    next,
    note,
  };
}

export default async function SimulatePage({ searchParams }: { searchParams: Promise<{ campanha?: string; anuncio?: string; depois?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (
    <div className="page-head">
      <div>
        <Link href="/promocoes" className="muted sim-back">
          ← Promoções
        </Link>
        <h1>A promoção vale a pena?</h1>
        <p className="sub">
          Antes de aceitar uma campanha, veja quanto sobra por venda hoje e no preço da campanha (com tarifa e frete do Mercado Livre) e quanto a
          mais você precisa vender para compensar.
        </p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador usa o simulador.
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

  const sp = await searchParams;
  const itemId = sp.anuncio?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
  const validItem = itemId && /^MLB\d+$/.test(itemId) ? itemId : null;

  let list: Campaign[] = [];
  let result: Result | null = null;
  let error: string | null = null;
  try {
    list = await campaigns(connection.mlUserId);
    const picked = validItem ? null : (list.find((c) => c.id === sp.campanha) ?? null);
    result = await simulate(connection.mlUserId, picked, validItem, sp.depois ?? null);
  } catch (e) {
    error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar os dados no Mercado Livre agora. Tente de novo em instantes.';
    console.error('[ml] simulador', e instanceof Error ? e.message : e);
  }

  const nextHref = result?.next && sp.campanha ? `/promocoes/simular?campanha=${encodeURIComponent(sp.campanha)}&depois=${encodeURIComponent(result.next)}` : null;

  return (
    <main className="settings-page revenue">
      {head}

      <section className="panel sim-pick">
        <form method="get" action="/promocoes/simular" className="sim-form">
          <label className="field">
            <span className="label">Campanha</span>
            <select name="campanha" defaultValue={validItem ? '' : (sp.campanha ?? '')}>
              <option value="" disabled>
                Escolha uma campanha
              </option>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {promotionKind(c.type)}
                  {c.pending ? ' (agendada)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit">
            Simular
          </button>
        </form>
        <form method="get" action="/promocoes/simular" className="sim-form">
          <label className="field">
            <span className="label">Ou um anúncio, em todas as campanhas em que ele pode entrar</span>
            <input type="text" name="anuncio" placeholder="MLB1234567890" defaultValue={sp.anuncio ?? ''} aria-invalid={!!itemId && !validItem} />
          </label>
          <button className="btn soft" type="submit">
            Simular anúncio
          </button>
        </form>
      </section>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {result?.note && (
        <p className="alert" role="note">
          <Icon name="alert" size={16} /> {result.note}
        </p>
      )}

      {result && result.rows.length > 0 && (
        <>
          {!validItem && (
            <p className="sub">
              Mostrando {count(result.rows.length)} de {count(result.total)} anúncios que podem entrar, os que mais venderam primeiro.
            </p>
          )}
          <SimTable key={`${sp.campanha}|${validItem}|${sp.depois}`} rows={result.rows} costsEnabled={result.costsEnabled} />
          {nextHref && (
            <Link className="btn soft sim-next" href={nextHref}>
              Próximos anúncios
            </Link>
          )}
          <p className="sub sim-foot">
            Como a conta é feita: lucro por venda = preço + parte que o ML banca − tarifa de venda − frete que a loja paga − custo − imposto. A tarifa
            e o frete vêm do Mercado Livre para cada preço (abaixo de R$ 79 o frete vira o custo fixo por venda). A projeção usa o ritmo de vendas dos
            últimos 30 dias até o fim da campanha.
          </p>
        </>
      )}

      {result && result.rows.length === 0 && !result.note && <p className="sub">Nenhum anúncio candidato nesta campanha.</p>}
    </main>
  );
}

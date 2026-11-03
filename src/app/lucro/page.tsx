import Link from 'next/link';
import { PERIOD_LABEL } from '@/components/revenue/Kpi';
import { PeriodPicker } from '@/components/revenue/PeriodPicker';
import { StoreProfitView, type ProfitProduct } from '@/components/store-profit/StoreProfitView';
import { Icon } from '@/components/ui/Icon';
import { readItemCosts } from '@/lib/ml/cost-store';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { readFixedCosts } from '@/lib/ml/fixed-cost-store';
import { salesByProduct } from '@/lib/ml/products';
import { brtDay, daysInRange, fetchOrders, MAX_CUSTOM_DAYS, PERIODS, resolvePeriod, type Range, type SearchPage } from '@/lib/ml/revenue';
import { fetchShipping, pool, type Get } from '@/lib/ml/simulate';
import type { FixedCost } from '@/lib/ml/store-profit';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import '@/styles/store-profit.css';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Lucro da Loja' };

const get: Get = (path) => mlGet(path);

/** Vendas por produto nos dois períodos, com o custo salvo e o frete cotado uma vez por anúncio. */
async function loadProducts(sellerId: number, current: Range, previous: Range): Promise<{ products: ProfitProduct[]; costsEnabled: boolean }> {
  const orders = (r: Range) => fetchOrders(sellerId, r, (path) => mlGet<SearchPage>(path));
  const [a, b] = await Promise.all([orders(current), orders(previous)]);
  const now = salesByProduct(a);
  const before = salesByProduct(b);
  const ids = [...new Set([...now.keys(), ...before.keys()])].filter((id) => (now.get(id)?.units ?? 0) + (before.get(id)?.units ?? 0) > 0);

  // Frete no preço médio vendido (do período atual quando vendeu nele), como em Produtos.
  const shippingP = pool(ids, 10, (id) => {
    const s = (now.get(id)?.units ? now.get(id) : before.get(id))!;
    return fetchShipping(sellerId, id, Math.round((s.revenue / s.units) * 100) / 100, get).catch(() => null);
  });
  const [costs, shipping] = await Promise.all([readItemCosts(ids), shippingP]);

  const pick = (s: ReturnType<typeof now.get>) => (s && s.units > 0 ? { revenue: s.revenue, units: s.units, fees: s.fees, shipments: s.shipments } : null);
  const products = ids.map((id, i): ProfitProduct => ({
    itemId: id,
    now: pick(now.get(id)),
    before: pick(before.get(id)),
    shippingPerShipment: shipping[i],
    cost: costs?.get(id) ?? null,
  }));
  return { products, costsEnabled: costs !== null };
}

export default async function StoreProfitPage({ searchParams }: { searchParams: Promise<{ dias?: string; de?: string; ate?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (sub: string) => (
    <div className="page-head">
      <div>
        <h1>Lucro da Loja</h1>
        <p className="sub">{sub}</p>
      </div>
    </div>
  );
  const defaultSub = 'Do lucro estimado dos produtos ao que sobra para a loja depois dos custos fixos.';

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head(defaultSub)}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador vê o lucro da loja.
        </p>
      </main>
    );
  }

  const period = resolvePeriod(await searchParams);
  const days = { now: daysInRange(period.current), before: daysInRange(period.previous) };
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const label =
    period.selection.kind === 'preset'
      ? period.selection.days === 1
        ? 'Hoje'
        : `Últimos ${period.selection.days} dias`
      : `${fmt(days.now[0])} a ${fmt(days.now[days.now.length - 1])}`;
  const span = `${fmt(days.now[0])} a ${fmt(days.now[days.now.length - 1])}/${days.now[days.now.length - 1].slice(0, 4)}`;
  const sub = `${period.selection.kind === 'preset' ? `${label} (${span})` : `De ${span}`}, horário de Brasília. O lucro dos produtos considera só os que têm custo cadastrado.`;

  const connection = await getConnectionStatus();
  const fixedCosts: FixedCost[] | null = await readFixedCosts();

  let data: { products: ProfitProduct[]; costsEnabled: boolean } | null = null;
  let error: string | null = null;
  if (connection) {
    try {
      data = await loadProducts(connection.mlUserId, period.current, period.previous);
    } catch (e) {
      error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar os pedidos no Mercado Livre agora. Tente de novo em instantes.';
      console.error('[ml] lucro', e instanceof Error ? e.message : e);
    }
  }

  return (
    <main className="settings-page revenue">
      {head(sub)}
      <PeriodPicker
        basePath="/lucro"
        presets={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        selection={period.selection}
        today={brtDay(new Date())}
        maxDays={MAX_CUSTOM_DAYS}
      />
      {period.error && (
        <p className="field-error" role="alert">
          {period.error} Mostrando os últimos 30 dias.
        </p>
      )}
      {!connection && (
        <p className="alert" role="note">
          <Icon name="alert" size={16} /> A conta do Mercado Livre não está conectada. <Link href="/configuracoes/mercado-livre">Conectar agora</Link>
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <StoreProfitView
        products={data?.products ?? null}
        costsEnabled={data?.costsEnabled ?? true}
        fixedCosts={fixedCosts}
        days={days}
        labels={{ now: label, before: period.selection.kind === 'preset' && period.selection.days === 1 ? 'Ontem' : `${days.before.length} dias anteriores` }}
        today={brtDay(new Date())}
      />
    </main>
  );
}

import Link from 'next/link';
import { ProductsTable, type ProductRow } from '@/components/products/ProductsTable';
import { PERIOD_LABEL } from '@/components/revenue/Kpi';
import { PeriodPicker } from '@/components/revenue/PeriodPicker';
import { Icon } from '@/components/ui/Icon';
import { readItemCosts } from '@/lib/ml/cost-store';
import { getConnectionStatus, mlGet, MlNotConnectedError } from '@/lib/ml/connection';
import { fetchListings, salesByProduct } from '@/lib/ml/products';
import { brtDay, fetchOrders, MAX_CUSTOM_DAYS, PERIODS, resolvePeriod, type Range, type SearchPage } from '@/lib/ml/revenue';
import { fetchShipping, pool, type Get } from '@/lib/ml/simulate';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import '@/styles/products.css';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Produtos' };

const get: Get = (path) => mlGet(path);

/** Vendas por produto no período e no anterior, com situação do anúncio, frete cotado e custo salvo. */
async function load(sellerId: number, current: Range, previous: Range): Promise<{ rows: ProductRow[]; costsEnabled: boolean }> {
  const orders = (r: Range) => fetchOrders(sellerId, r, (path) => mlGet<SearchPage>(path));
  const [now, before] = await Promise.all([orders(current), orders(previous)]);
  const sales = [...salesByProduct(now).values()].filter((p) => p.orders > 0).sort((a, b) => b.revenue - a.revenue);
  const prev = salesByProduct(before);
  const ids = sales.map((p) => p.itemId);

  // Frete no preço médio vendido: perto do que a loja pagou em cada envio do período.
  const shippingP = pool(sales, 10, (p) =>
    fetchShipping(sellerId, p.itemId, Math.round((p.revenue / p.units) * 100) / 100, get).catch(() => null),
  );
  const [listings, costs, shipping] = await Promise.all([fetchListings(ids, get), readItemCosts(ids), shippingP]);

  const rows = sales.map((p, i): ProductRow => {
    const l = listings.get(p.itemId);
    return {
      ...p,
      prevRevenue: prev.get(p.itemId)?.revenue ?? 0,
      thumbnail: l?.thumbnail ?? null,
      permalink: l?.permalink ?? null,
      health: l?.health ?? null,
      shippingPerShipment: shipping[i],
      cost: costs?.get(p.itemId) ?? null,
    };
  });
  return { rows, costsEnabled: costs !== null };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ dias?: string; de?: string; ate?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  const head = (
    <div className="page-head">
      <div>
        <h1>Produtos</h1>
        <p className="sub">Receita, lucro estimado, margem, pedidos e saúde de cada anúncio que vendeu no período (horário de Brasília).</p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') {
    return (
      <main className="settings-page">
        {head}
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador vê os produtos.
        </p>
      </main>
    );
  }

  const period = resolvePeriod(await searchParams);
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

  let data: { rows: ProductRow[]; costsEnabled: boolean } | null = null;
  let error: string | null = null;
  try {
    data = await load(connection.mlUserId, period.current, period.previous);
  } catch (e) {
    error = e instanceof MlNotConnectedError ? e.message : 'Não foi possível buscar os pedidos no Mercado Livre agora. Tente de novo em instantes.';
    console.error('[ml] produtos', e instanceof Error ? e.message : e);
  }

  const key = period.selection.kind === 'preset' ? `d${period.selection.days}` : `${period.selection.from}|${period.selection.to}`;

  return (
    <main className="settings-page revenue">
      {head}
      <PeriodPicker
        basePath="/produtos"
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

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {data && data.rows.length > 0 && (
        <>
          <ProductsTable key={key} rows={data.rows} costsEnabled={data.costsEnabled} />
          <p className="sub products-foot">
            Como a conta é feita: lucro estimado = receita − tarifas de venda do ML − frete que a loja paga − custo × unidades − imposto. A receita e
            as tarifas vêm dos pedidos não cancelados do período; o frete é a cotação do ML no preço médio vendido, uma vez por envio (pedidos do mesmo
            carrinho dividem o frete). O custo é o mesmo do simulador de promoções. A saúde é a nota de qualidade que o ML dá ao anúncio, de 0 a 100.
          </p>
        </>
      )}

      {data && data.rows.length === 0 && <p className="sub">Nenhuma venda neste período.</p>}
    </main>
  );
}

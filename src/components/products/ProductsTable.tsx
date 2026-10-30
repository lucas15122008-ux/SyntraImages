'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTax } from '@/components/promo/tax';
import { Delta, Kpi } from '@/components/revenue/Kpi';
import { Stagger } from '@/components/revenue/RevenueMotion';
import { count, money, share } from '@/components/revenue/format';
import { Icon } from '@/components/ui/Icon';
import { saveItemCost } from '@/lib/ml/costs';
import { estimateProfit, type ListingHealth, type ProductSales } from '@/lib/ml/products';
import { parseMoney } from '@/lib/ml/simulate';

export type ProductRow = ProductSales & {
  prevRevenue: number;
  thumbnail: string | null;
  permalink: string | null;
  /** null quando o ML não devolveu o anúncio. */
  health: ListingHealth | null;
  shippingPerShipment: number | null;
  cost: number | null;
};

type Sort = 'revenue' | 'profit' | 'margin' | 'orders' | 'health';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'revenue', label: 'Maior receita' },
  { value: 'profit', label: 'Maior lucro' },
  { value: 'margin', label: 'Menor margem' },
  { value: 'orders', label: 'Mais pedidos' },
  { value: 'health', label: 'Pior saúde' },
];
const PAGE = 50;

const toText = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','));
const HEALTH_CLASS = { good: 'ok', medium: 'warn', bad: 'bad' } as const;
const HEALTH_LABEL = { good: 'boa', medium: 'média', bad: 'ruim' } as const;

function HealthCell({ h }: { h: ListingHealth | null }) {
  if (!h) return <span className="muted">não encontrado</span>;
  return (
    <>
      {h.level ? (
        <span className={`pill ${HEALTH_CLASS[h.level]}`}>
          {h.score} · {HEALTH_LABEL[h.level]}
        </span>
      ) : (
        <span className="pill">sem nota</span>
      )}
      <span className={`block muted${h.active && h.stock > 0 ? '' : ' warn-text'}`}>
        {h.status}
        {h.active && h.stock > 0 ? ` · ${count(h.stock)} em estoque` : ''}
      </span>
    </>
  );
}

function CostField({ row, text, onText, onSaved, enabled }: { row: ProductRow; text: string; onText: (t: string) => void; onSaved: (n: number) => void; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const value = parseMoney(text);

  function save() {
    if (!enabled || value === null || value === row.cost) return;
    start(async () => {
      const err = await saveItemCost(row.itemId, value);
      setMsg(err);
      if (!err) onSaved(value);
    });
  }

  return (
    <>
      <input
        className="product-cost"
        type="text"
        inputMode="decimal"
        placeholder="R$"
        value={text}
        onChange={(e) => onText(e.target.value)}
        onBlur={save}
        aria-invalid={text !== '' && value === null}
        aria-label={`Custo por unidade de ${row.title}`}
      />
      {pending && <span className="block muted">salvando…</span>}
      {msg && <span className="block field-error">{msg}</span>}
    </>
  );
}

export function ProductsTable({ rows, costsEnabled }: { rows: ProductRow[]; costsEnabled: boolean }) {
  const [taxText, writeTax] = useTax();
  const taxPct = Math.min(100, parseMoney(taxText) ?? 0);
  const [costs, setCosts] = useState<Record<string, { text: string; saved: number | null }>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, { text: toText(r.cost), saved: r.cost }])),
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('revenue');
  const [shown, setShown] = useState(PAGE);

  const calcs = useMemo(
    () =>
      new Map(
        rows.map((r) => [
          r.itemId,
          estimateProfit({ ...r, cost: parseMoney(costs[r.itemId]?.text ?? '') ?? null, taxPct }),
        ]),
      ),
    [rows, costs, taxPct],
  );

  const totals = useMemo(() => {
    let revenue = 0;
    let prevRevenue = 0;
    let orders = 0;
    let profit = 0;
    let profitRevenue = 0;
    let withProfit = 0;
    let weak = 0;
    for (const r of rows) {
      revenue += r.revenue;
      prevRevenue += r.prevRevenue;
      orders += r.orders;
      const c = calcs.get(r.itemId);
      if (c) {
        profit += c.profit;
        profitRevenue += r.revenue;
        withProfit++;
      }
      if (r.health && (r.health.level === 'bad' || !r.health.active)) weak++;
    }
    return { revenue, prevRevenue, orders, profit, margin: profitRevenue ? profit / profitRevenue : 0, withProfit, weak };
  }, [rows, calcs]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.title.toLowerCase().includes(q) || r.itemId.toLowerCase().includes(q) || !!r.sku?.toLowerCase().includes(q)) : rows;
    const profit = (r: ProductRow) => calcs.get(r.itemId)?.profit ?? -Infinity;
    const margin = (r: ProductRow) => calcs.get(r.itemId)?.margin ?? Infinity;
    const health = (r: ProductRow) => r.health?.score ?? 101;
    const by: Record<Sort, (a: ProductRow, b: ProductRow) => number> = {
      revenue: (a, b) => b.revenue - a.revenue,
      profit: (a, b) => profit(b) - profit(a),
      margin: (a, b) => margin(a) - margin(b),
      orders: (a, b) => b.orders - a.orders,
      health: (a, b) => health(a) - health(b),
    };
    return [...filtered].sort(by[sort]);
  }, [rows, calcs, query, sort]);

  return (
    <>
      <Stagger className="kpis" label="Resumo dos produtos">
        <Kpi hero label="Receita dos produtos" value={totals.revenue} format="money">
          <Delta now={totals.revenue} before={totals.prevRevenue} />
        </Kpi>
        <Kpi label="Lucro estimado" value={totals.profit} format="money">
          <span className="delta muted">
            {totals.withProfit === rows.length ? 'todos os produtos' : `${count(totals.withProfit)} de ${count(rows.length)} produtos (os que têm custo)`}
          </span>
        </Kpi>
        <Kpi label="Margem estimada" value={totals.margin} format="share">
          <span className="delta muted">lucro sobre a receita</span>
        </Kpi>
        <Kpi label="Pedidos" value={totals.orders} format="count">
          <span className="delta muted">{count(rows.length)} produtos venderam</span>
        </Kpi>
        <Kpi label="Precisam de atenção" value={totals.weak} format="count">
          <span className="delta muted">saúde ruim, pausados ou sem estoque</span>
        </Kpi>
      </Stagger>

      <section className="panel products-controls">
        <label className="field input-icon-field">
          <span className="label">Buscar produto</span>
          <span className="input-icon">
            <Icon name="zoom" size={16} />
            <input type="search" placeholder="Título, SKU ou MLB" value={query} onChange={(e) => setQuery(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="label">Ordenar por</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Imposto sobre a venda (%)</span>
          <input type="text" inputMode="decimal" value={taxText} onChange={(e) => writeTax(e.target.value)} />
        </label>
      </section>

      {!costsEnabled && (
        <p className="alert" role="note">
          Os custos digitados ainda não ficam salvos: falta rodar a migração 0006_item_costs.sql no Supabase.
        </p>
      )}

      <section className="panel products-panel">
        {list.length ? (
          <table className="data-table products-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Receita</th>
                <th>Pedidos</th>
                <th>Custo por unidade</th>
                <th>Lucro estimado</th>
                <th>Margem</th>
                <th>Saúde</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((r) => {
                const c = calcs.get(r.itemId);
                const cost = costs[r.itemId];
                return (
                  <tr key={r.itemId}>
                    <td>
                      <div className="product-item">
                        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do ML */}
                        {r.thumbnail ? <img src={r.thumbnail} alt="" width={44} height={44} /> : <span className="img-ph" />}
                        <div>
                          <a className="title" href={r.permalink ?? `https://produto.mercadolivre.com.br/${r.itemId.replace('MLB', 'MLB-')}`} target="_blank" rel="noreferrer">
                            {r.title}
                          </a>
                          <span className="muted">
                            {r.sku ? `SKU ${r.sku} · ` : ''}
                            {r.itemId}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {money(r.revenue)}
                      <span className="block">
                        {r.prevRevenue ? <Delta now={r.revenue} before={r.prevRevenue} versus="" /> : <span className="delta">sem vendas antes</span>}
                      </span>
                    </td>
                    <td>
                      {count(r.orders)}
                      <span className="block muted">
                        {count(r.units)} un.{r.cancelled ? ` · ${count(r.cancelled)} cancel.` : ''}
                      </span>
                    </td>
                    <td>
                      <CostField
                        row={{ ...r, cost: cost.saved }}
                        text={cost.text}
                        enabled={costsEnabled}
                        onText={(text) => setCosts((s) => ({ ...s, [r.itemId]: { ...s[r.itemId], text } }))}
                        onSaved={(saved) => setCosts((s) => ({ ...s, [r.itemId]: { ...s[r.itemId], saved } }))}
                      />
                    </td>
                    <td>
                      {c ? (
                        <span className={c.profit >= 0 ? 'up' : 'down'}>{money(c.profit)}</span>
                      ) : (
                        <span className="muted">{r.shippingPerShipment === null ? 'sem frete do ML' : 'informe o custo'}</span>
                      )}
                      <span className="block muted">
                        tarifa {money(r.fees)}
                        {r.shippingPerShipment !== null && ` · frete ${money(r.shippingPerShipment * r.shipments)}`}
                      </span>
                    </td>
                    <td>{c?.margin != null ? <span className={c.margin >= 0 ? 'up' : 'down'}>{share(c.margin)}</span> : <span className="muted">—</span>}</td>
                    <td>
                      <HealthCell h={r.health} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="sub">Nenhum produto com esse nome.</p>
        )}
        {list.length > shown && (
          <button type="button" className="btn soft products-more" onClick={() => setShown((n) => n + PAGE)}>
            Mostrar mais {count(Math.min(PAGE, list.length - shown))} de {count(list.length - shown)}
          </button>
        )}
      </section>
    </>
  );
}

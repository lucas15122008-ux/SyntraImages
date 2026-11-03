'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useTax } from '@/components/promo/tax';
import { count, money, share } from '@/components/revenue/format';
import { addFixedCost, deleteFixedCost, endFixedCost } from '@/lib/ml/fixed-costs';
import type { ProductSales } from '@/lib/ml/products';
import { parseMoney } from '@/lib/ml/simulate';
import { fixedCostForDays, storeProfit, type FixedCost, type StoreProfit } from '@/lib/ml/store-profit';

type Sales = Pick<ProductSales, 'revenue' | 'units' | 'fees' | 'shipments'>;

export type ProfitProduct = {
  itemId: string;
  /** Vendas no período atual e no anterior; null quando não vendeu. */
  now: Sales | null;
  before: Sales | null;
  shippingPerShipment: number | null;
  cost: number | null;
};

type Props = {
  /** null quando não deu para buscar os pedidos (ML desconectado ou fora do ar). */
  products: ProfitProduct[] | null;
  costsEnabled: boolean;
  /** null quando a migração 0009 ainda não rodou. */
  fixedCosts: FixedCost[] | null;
  days: { now: string[]; before: string[] };
  labels: { now: string; before: string };
  today: string;
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function summarize(products: ProfitProduct[], side: 'now' | 'before', fixed: number, taxPct: number): StoreProfit {
  const list = products.flatMap((p) => {
    const sales = p[side];
    return sales ? [{ sales, shippingPerShipment: p.shippingPerShipment, cost: p.cost }] : [];
  });
  return storeProfit(list, fixed, taxPct);
}

function FixedCostRow({ cost, inPeriod, today }: { cost: FixedCost; inPeriod: number; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ended = cost.until !== null && cost.until < today;

  const run = (fn: () => Promise<string | null>) =>
    start(async () => {
      const err = await fn();
      setMsg(err);
      if (!err) router.refresh();
    });

  return (
    <li className={`fixed-cost${ended ? ' ended' : ''}`}>
      <span className="fixed-name">
        {cost.description}
        {msg && <span className="block field-error">{msg}</span>}
      </span>
      <span className="muted fixed-since">
        {cost.until ? `${br(cost.since)} a ${br(cost.until)}` : `desde ${br(cost.since)}`}
      </span>
      <span className="fixed-monthly">{money(cost.monthly)}/mês</span>
      <span className="muted fixed-period">{money(inPeriod)} no período</span>
      <span className="fixed-actions">
        {!cost.until && cost.since <= today && (
          <button
            type="button"
            className="btn ghost"
            disabled={pending}
            title="Para de contar a partir de amanhã; os períodos passados continuam com ele"
            onClick={() => run(() => endFixedCost(cost.id))}
          >
            Encerrar
          </button>
        )}
        <button
          type="button"
          className="btn ghost fixed-del"
          disabled={pending}
          title="Apaga o lançamento, inclusive dos períodos passados"
          onClick={() => {
            if (confirm(`Excluir "${cost.description}"? Ele some também dos períodos passados. Para só parar de contar daqui em diante, use Encerrar.`))
              run(() => deleteFixedCost(cost.id));
          }}
        >
          Excluir
        </button>
      </span>
    </li>
  );
}

function AddFixedCost({ defaultSince }: { defaultSince: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [since, setSince] = useState(defaultSince);
  const [msg, setMsg] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const monthly = parseMoney(amount);
    if (!description.trim()) return setMsg('Escreva uma descrição.');
    if (monthly === null || monthly <= 0) return setMsg('Informe um valor mensal maior que zero.');
    start(async () => {
      const err = await addFixedCost({ description, monthly, since });
      setMsg(err);
      if (!err) {
        setDescription('');
        setAmount('');
        router.refresh();
      }
    });
  }

  return (
    <form className="fixed-form" onSubmit={submit}>
      <label className="field">
        <span className="label">Descrição</span>
        <input type="text" placeholder="Ex.: Internet" maxLength={80} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Valor mensal (R$)</span>
        <input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Desde</span>
        <input type="date" required value={since} onChange={(e) => setSince(e.target.value)} />
      </label>
      <button type="submit" className="btn soft" disabled={pending}>
        {pending ? 'Lançando…' : 'Lançar custo'}
      </button>
      {msg && (
        <p className="field-error fixed-form-msg" role="alert">
          {msg}
        </p>
      )}
    </form>
  );
}

export function StoreProfitView({ products, costsEnabled, fixedCosts, days, labels, today }: Props) {
  const [taxText, writeTax] = useTax();
  const taxPct = Math.min(100, parseMoney(taxText) ?? 0);

  const fixed = useMemo(() => {
    const list = fixedCosts ?? [];
    const now = list.map((c) => fixedCostForDays(c, days.now));
    const before = list.map((c) => fixedCostForDays(c, days.before));
    const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
    return { now, total: { now: sum(now), before: sum(before) } };
  }, [fixedCosts, days]);

  const result = useMemo(
    () =>
      products && {
        now: summarize(products, 'now', fixed.total.now, taxPct),
        before: summarize(products, 'before', fixed.total.before, taxPct),
      },
    [products, fixed, taxPct],
  );

  // Custos que valem em algum dia dos dois períodos, ou que ainda estão valendo.
  const first = days.before[0] ?? days.now[0];
  const visible = (fixedCosts ?? []).map((c, i) => ({ c, inPeriod: fixed.now[i] })).filter(({ c }) => c.until === null || c.until >= first);
  const older = (fixedCosts?.length ?? 0) - visible.length;

  const coverage = (r: StoreProfit) =>
    r.products === 0 ? 'sem vendas' : r.withProfit === r.products ? 'todos os produtos' : `${count(r.withProfit)} de ${count(r.products)} produtos`;

  return (
    <>
      <section className="panel store-profit">
        <div className="store-profit-head">
          <h2>Do lucro dos produtos ao lucro da loja</h2>
          <label className="field tax-field">
            <span className="label">Imposto sobre a venda (%)</span>
            <input type="text" inputMode="decimal" value={taxText} onChange={(e) => writeTax(e.target.value)} />
          </label>
        </div>
        {result ? (
          <table className="data-table profit-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Linha</span>
                </th>
                <th>{labels.now}</th>
                <th>{labels.before}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Receita</td>
                <td>{money(result.now.revenue)}</td>
                <td className="muted-col">{money(result.before.revenue)}</td>
              </tr>
              <tr>
                <td>
                  Lucro estimado dos produtos
                  <span className="block muted">tarifas, frete, custo e imposto já descontados</span>
                </td>
                <td>
                  {money(result.now.productProfit)}
                  <span className="block muted">{coverage(result.now)}</span>
                </td>
                <td className="muted-col">
                  {money(result.before.productProfit)}
                  <span className="block muted">{coverage(result.before)}</span>
                </td>
              </tr>
              <tr>
                <td>− Custos fixos</td>
                <td>{money(result.now.fixed)}</td>
                <td className="muted-col">{money(result.before.fixed)}</td>
              </tr>
              <tr className="total">
                <td>Lucro da loja</td>
                <td className={result.now.store < 0 ? 'down' : undefined}>{money(result.now.store)}</td>
                <td className={`muted-col${result.before.store < 0 ? ' down' : ''}`}>{money(result.before.store)}</td>
              </tr>
              <tr>
                <td>Margem da loja</td>
                <td>{result.now.margin === null ? '—' : share(result.now.margin)}</td>
                <td className="muted-col">{result.before.margin === null ? '—' : share(result.before.margin)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="sub">Sem os pedidos do Mercado Livre não dá para calcular o lucro agora.</p>
        )}
        {!costsEnabled && (
          <p className="alert" role="note">
            Os custos dos produtos não puderam ser lidos: falta rodar a migração 0006_item_costs.sql no Supabase.
          </p>
        )}
        {result && result.now.withProfit < result.now.products && (
          <p className="sub store-profit-foot">
            Produtos sem custo entram na receita, mas não no lucro, então a margem fica menor do que a real. Cadastre os custos em <a href="/produtos">Produtos</a>.
          </p>
        )}
      </section>

      <section className="panel fixed-costs">
        <h2>Custos fixos da loja</h2>
        {fixedCosts === null ? (
          <p className="alert" role="note">
            Para lançar custos fixos, rode a migração 0009_fixed_costs.sql no Supabase.
          </p>
        ) : (
          <>
            {visible.length ? (
              <ul className="fixed-list">
                {visible.map(({ c, inPeriod }) => (
                  <FixedCostRow key={c.id} cost={c} inPeriod={inPeriod} today={today} />
                ))}
              </ul>
            ) : (
              <p className="sub">Nenhum custo fixo lançado. Lance aluguel, contador, sistemas, salários e o que mais a loja paga todo mês.</p>
            )}
            {older > 0 && <p className="sub">{count(older)} custo(s) encerrado(s) antes deste período não aparecem aqui.</p>}
            <AddFixedCost defaultSince={days.now[0]} />
            <p className="sub store-profit-foot">
              O valor mensal é dividido por dia: cada dia vale o valor ÷ os dias daquele mês, e só contam os dias desde o início do custo.
            </p>
          </>
        )}
      </section>
    </>
  );
}

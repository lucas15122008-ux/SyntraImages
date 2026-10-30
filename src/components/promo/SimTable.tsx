'use client';

import { useMemo, useState, useTransition } from 'react';
import { count, money, share } from '@/components/revenue/format';
import { quoteShipping, saveItemCost } from '@/lib/ml/costs';
import { useTax } from './tax';
import { parseMoney, projection, saleFee, unitProfit, verdict, type SimRow, type Verdict } from '@/lib/ml/simulate';

export type SimRowView = SimRow & { cost: number | null; kind: string };

const DAY_MS = 86_400_000;

const toText = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','));
const keyOf = (r: SimRowView) => `${r.item.id}|${r.offer.promotionId}`;

/** Dias que faltam para a campanha acabar; 30 quando não tem data. */
function daysLeft(finish: string | null, now: number): number {
  if (!finish) return 30;
  return Math.max(1, Math.ceil((new Date(finish).getTime() - now) / DAY_MS));
}

type Input = { priceText: string; shipPromo: number | null; msg: string | null };
/** Custo é do anúncio: o mesmo anúncio em várias campanhas usa um só. */
type CostInput = { text: string; saved: number | null };

type Calc = { now: number; promo: number; v: Verdict; proj: { without: number; with: number }; days: number; margin: number };

/** Preço digitado se estiver dentro da faixa da campanha; senão, null. */
function typedPrice(row: SimRowView, text: string): number | null {
  const n = parseMoney(text);
  const r = row.offer.range;
  if (n === null || (r && (n < r.min || n > r.max))) return null;
  return n;
}

function compute(row: SimRowView, input: Input, costText: string, taxPct: number, liftPct: number, now: number): Calc | null {
  const cost = parseMoney(costText);
  if (cost === null) return null;
  const { item, offer } = row;
  const price = typedPrice(row, input.priceText) ?? offer.price;
  const rebate = (offer.originalPrice * offer.meliPct) / 100;
  const nowP = unitProfit({ price: item.price, fee: saleFee(item.price, row.fee), shipping: row.shippingNow ?? 0, cost, taxPct });
  const promoP = unitProfit({ price, meliRebate: rebate, fee: saleFee(price + rebate, row.fee), shipping: input.shipPromo ?? 0, cost, taxPct });
  const days = daysLeft(offer.finish, now);
  return {
    now: nowP,
    promo: promoP,
    v: verdict(nowP, promoP),
    proj: projection(row.units30 / 30, days, liftPct, nowP, promoP),
    days,
    margin: promoP / (price + rebate),
  };
}

function VerdictPill({ v }: { v: Verdict | null }) {
  if (!v) return <span className="pill">informe o custo</span>;
  if (v.kind === 'loss') return <span className="pill bad">prejuízo em cada venda</span>;
  if (v.kind === 'better') return <span className="pill ok">lucra mais por venda</span>;
  const cls = v.extra <= 0.2 ? 'ok' : v.extra <= 0.6 ? 'warn' : 'bad';
  return <span className={`pill ${cls}`}>vender {share(v.extra)} a mais</span>;
}

function Row({
  row,
  input,
  costInput,
  calc,
  costsEnabled,
  update,
  updateCost,
}: {
  row: SimRowView;
  input: Input;
  costInput: CostInput;
  calc: Calc | null;
  costsEnabled: boolean;
  update: (patch: Partial<Input>) => void;
  updateCost: (patch: Partial<CostInput>) => void;
}) {
  const { item, offer } = row;
  const [pending, start] = useTransition();
  const range = offer.range;
  const typed = typedPrice(row, input.priceText);
  const price = typed ?? offer.price;
  const cost = parseMoney(costInput.text);

  function saveCost() {
    if (cost === null || cost === costInput.saved || !costsEnabled) return;
    start(async () => {
      const err = await saveItemCost(item.id, cost);
      update({ msg: err });
      if (!err) updateCost({ saved: cost });
    });
  }

  function requote() {
    if (typed === null) return;
    if (typed === offer.price) return update({ shipPromo: row.shippingPromo, msg: null });
    start(async () => {
      const s = await quoteShipping(item.id, typed);
      update({ shipPromo: s, msg: s === null ? 'Não foi possível consultar o frete neste preço.' : null });
    });
  }

  return (
    <li className="sim-row panel">
      <div className="sim-item">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do ML */}
        {item.thumbnail ? <img src={item.thumbnail} alt="" width={52} height={52} /> : <span className="sim-thumb" />}
        <div>
          <a className="title" href={`https://produto.mercadolivre.com.br/${item.id.replace('MLB', 'MLB-')}`} target="_blank" rel="noreferrer">
            {item.title}
          </a>
          <span className="muted">
            {item.id} · {row.kind}: {offer.promotionName} · vendeu {count(row.units30)} em 30 dias · {count(item.stock)} em estoque
          </span>
        </div>
      </div>

      <label className="field sim-cost">
        <span className="label">Custo do produto</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="R$"
          value={costInput.text}
          onChange={(e) => updateCost({ text: e.target.value })}
          onBlur={saveCost}
          aria-invalid={costInput.text !== '' && cost === null}
        />
      </label>

      <div className="sim-col">
        <span className="label">Hoje</span>
        <strong>{money(item.price)}</strong>
        <span className="muted">
          tarifa {money(saleFee(item.price, row.fee))} · frete {row.shippingNow === null ? '?' : money(row.shippingNow)}
        </span>
        {calc && <span className={calc.now > 0 ? 'up' : 'down'}>{money(calc.now)} por venda</span>}
      </div>

      <div className="sim-col">
        <span className="label">Na campanha</span>
        {range ? (
          <input
            type="text"
            inputMode="decimal"
            className="sim-price"
            value={input.priceText}
            onChange={(e) => update({ priceText: e.target.value })}
            onBlur={requote}
            aria-invalid={typed === null}
            aria-label={`Preço na campanha, entre ${money(range.min)} e ${money(range.max)}`}
          />
        ) : (
          <strong>{money(offer.price)}</strong>
        )}
        <span className="muted">
          {range && typed === null
            ? `de ${money(range.min)} a ${money(range.max)}`
            : price < item.price
              ? `${share(1 - price / item.price)} abaixo de hoje`
              : 'não baixa o preço de hoje'}
          {offer.meliPct ? ` · ML banca ${money((offer.originalPrice * offer.meliPct) / 100)}` : ''}
          {' · frete '}
          {input.shipPromo === null ? '?' : money(input.shipPromo)}
        </span>
        {calc && (
          <span className={calc.promo > 0 ? 'up' : 'down'}>
            {money(calc.promo)} por venda ({share(calc.margin)})
          </span>
        )}
      </div>

      <div className="sim-col sim-verdict">
        <span className="label">Para valer a pena</span>
        <VerdictPill v={calc?.v ?? null} />
        {calc && row.units30 > 0 && (
          <span className="muted">
            em {count(calc.days)} dias: {money(calc.proj.with)} com a campanha vs. {money(calc.proj.without)} sem
          </span>
        )}
        {calc && row.units30 === 0 && <span className="muted">sem vendas nos últimos 30 dias para projetar</span>}
        {pending && <span className="muted">atualizando…</span>}
        {input.msg && <span className="field-error">{input.msg}</span>}
      </div>
    </li>
  );
}

export function SimTable({ rows, costsEnabled }: { rows: SimRowView[]; costsEnabled: boolean }) {
  const [taxText, writeTax] = useTax();
  const [liftText, setLiftText] = useState('30');
  const [now] = useState(() => Date.now());
  const [inputs, setInputs] = useState<Record<string, Input>>(() =>
    Object.fromEntries(
      rows.map((r) => [keyOf(r), { priceText: toText(r.offer.price), shipPromo: r.shippingPromo, msg: null }])),
  );
  const [costs, setCosts] = useState<Record<string, CostInput>>(() =>
    Object.fromEntries(rows.map((r) => [r.item.id, { text: toText(r.cost), saved: r.cost }])),
  );

  const taxPct = Math.min(100, parseMoney(taxText) ?? 0);
  const liftPct = parseMoney(liftText) ?? 0;
  const calcs = useMemo(
    () => Object.fromEntries(rows.map((r) => [keyOf(r), compute(r, inputs[keyOf(r)], costs[r.item.id].text, taxPct, liftPct, now)])),
    [rows, inputs, costs, taxPct, liftPct, now],
  );

  const all = Object.values(calcs).filter((c): c is Calc => c !== null);
  const loss = all.filter((c) => c.v.kind === 'loss').length;
  const good = all.filter((c) => c.v.kind === 'better' || (c.v.kind === 'needs' && c.v.extra <= liftPct / 100)).length;
  const gain = all.reduce((s, c) => s + c.proj.with - c.proj.without, 0);

  return (
    <>
      <section className="panel sim-controls">
        <label className="field">
          <span className="label">Espero vender a mais na campanha (%)</span>
          <input type="text" inputMode="decimal" value={liftText} onChange={(e) => setLiftText(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Imposto sobre a venda (%)</span>
          <input type="text" inputMode="decimal" value={taxText} onChange={(e) => writeTax(e.target.value)} />
        </label>
        <div className="sim-summary">
          <span>
            <strong>{count(good)}</strong> valem a pena com esse aumento
          </span>
          <span>
            <strong className={loss ? 'down' : ''}>{count(loss)}</strong> dão prejuízo por venda
          </span>
          <span>
            <strong className={gain >= 0 ? 'up' : 'down'}>{money(gain)}</strong> de lucro a mais até o fim da campanha
          </span>
          <span className="muted">
            conta feita em {count(all.length)} de {count(rows.length)} anúncios (os que têm custo)
          </span>
        </div>
      </section>

      {!costsEnabled && (
        <p className="alert" role="note">
          Os custos digitados ainda não ficam salvos: falta rodar a migração 0006_item_costs.sql no Supabase.
        </p>
      )}

      <ul className="sim-list">
        {rows.map((r) => {
          const k = keyOf(r);
          return (
            <Row
              key={k}
              row={r}
              input={inputs[k]}
              costInput={costs[r.item.id]}
              calc={calcs[k]}
              costsEnabled={costsEnabled}
              update={(patch) => setInputs((s) => ({ ...s, [k]: { ...s[k], ...patch } }))}
              updateCost={(patch) => setCosts((s) => ({ ...s, [r.item.id]: { ...s[r.item.id], ...patch } }))}
            />
          );
        })}
      </ul>
    </>
  );
}

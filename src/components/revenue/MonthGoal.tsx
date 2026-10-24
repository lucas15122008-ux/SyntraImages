'use client';

import { motion } from 'framer-motion';
import { useActionState, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';
import type { GoalProgress } from '@/lib/ml/goal';
import { saveRevenueGoalForm } from '@/lib/ml/goal-actions';
import { money, share } from './format';
import { CountUp } from './RevenueMotion';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Meta do mês: barra de progresso, marca de onde deveria estar hoje e previsão de fechamento. */
export function MonthGoal({ month, progress }: { month: string; progress: GoalProgress | null }) {
  const [editing, setEditing] = useState(!progress);

  return (
    <section className="panel month-goal" aria-label={`Meta de ${month}`}>
      <div className="head">
        <h2>Meta de {month}</h2>
        {progress && !editing && (
          <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
            Mudar meta
          </button>
        )}
      </div>

      {editing ? (
        <GoalForm current={progress?.goal ?? null} onSaved={() => setEditing(false)} onCancel={progress ? () => setEditing(false) : undefined} />
      ) : (
        progress && <Progress p={progress} />
      )}
    </section>
  );
}

function GoalForm({ current, onSaved, onCancel }: { current: number | null; onSaved: () => void; onCancel?: () => void }) {
  const [state, formAction, pending] = useActionState(saveRevenueGoalForm, undefined as string | null | undefined);
  // undefined: ainda não enviou; null: salvou.
  useEffect(() => {
    if (state === null) onSaved();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="goal-form">
      <p className="sub">Quanto quer vender em vendas brutas no Mercado Livre este mês? A barra e a previsão aparecem assim que salvar.</p>
      <div className="goal-row">
        <span className="input-icon">
          <span className="prefix" aria-hidden="true">R$</span>
          <input
            type="text"
            name="amount"
            inputMode="decimal"
            required
            autoFocus={!!onCancel}
            defaultValue={current ? current.toLocaleString('pt-BR') : ''}
            placeholder="50.000"
            aria-label="Meta do mês em reais"
            aria-invalid={state ? true : undefined}
          />
        </span>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar meta'}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      {state && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={14} /> {state}
        </p>
      )}
    </form>
  );
}

function Progress({ p }: { p: GoalProgress }) {
  const reduced = usePrefersReducedMotion();
  const hit = p.done >= p.goal;
  const ahead = p.done >= p.expected;
  const onTrack = p.forecast !== null && p.forecast >= p.goal;
  const fill = Math.min(1, p.ratio);
  const marker = Math.min(1, p.expected / p.goal);

  return (
    <div className="goal-body">
      <div className="goal-numbers">
        <strong>
          <CountUp value={p.done} format="money" delay={0.1} />
        </strong>
        <span className="muted">
          de {money(p.goal)} · <b>{share(p.ratio)}</b>
        </span>
      </div>

      <div
        className={`goal-bar${hit ? ' hit' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={p.goal}
        aria-valuenow={p.done}
        aria-valuetext={`${money(p.done)} de ${money(p.goal)}`}
      >
        <motion.span
          className="fill"
          initial={{ scaleX: reduced ? fill : 0 }}
          animate={{ scaleX: fill }}
          transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : 0.1, ease: EASE }}
        />
        {!hit && <span className="marker" style={{ left: `${marker * 100}%` }} title={`Hoje deveria estar em ${money(p.expected)}`} />}
      </div>

      <div className="goal-facts">
        <div>
          <span className="label">Previsão de fechamento</span>
          {p.forecast === null ? (
            <span className="value muted">cedo demais para prever</span>
          ) : (
            <>
              <span className="value">{money(p.forecast)}</span>
              <span className={`delta ${onTrack ? 'up' : 'down'}`}>
                {onTrack ? 'no ritmo para bater a meta' : `${money(p.goal - p.forecast)} abaixo da meta`}
              </span>
            </>
          )}
        </div>
        <div>
          <span className="label">Onde deveria estar hoje</span>
          <span className="value">{money(p.expected)}</span>
          <span className={`delta ${ahead ? 'up' : 'down'}`}>
            {ahead ? `${money(p.done - p.expected)} à frente` : `${money(p.expected - p.done)} atrás`}
          </span>
        </div>
        <div>
          <span className="label">{hit ? 'Meta batida' : 'Para bater a meta'}</span>
          {hit ? (
            <span className="value">{money(p.done - p.goal)} acima</span>
          ) : (
            <>
              <span className="value">{money(p.neededPerDay)} por dia</span>
              <span className="delta muted">
                nos {p.daysLeft} {p.daysLeft === 1 ? 'dia que falta' : 'dias que faltam'}, contando hoje
                {p.pace !== null && ` · ritmo atual ${money(p.pace)}/dia`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

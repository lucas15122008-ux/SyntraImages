import { Icon } from '@/components/ui/Icon';

const STEPS = ['Montar o kit', 'Revisar fotos', 'Baixar'] as const;

/** Onde a pessoa está no fluxo: montar → revisar → baixar. */
export function KitSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="steps glass" aria-label="Etapas do kit">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={label} className={state === 'done' ? 'done' : undefined} aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className="sep" aria-hidden="true" />}
            <span className="dot" aria-hidden="true">
              {state === 'done' ? <Icon name="check" size={14} /> : n}
            </span>
            <span className="step-text">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

import type { Variants } from 'framer-motion';
import { useSyncExternalStore } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Entrada de uma tela inteira (usada na troca entre "Montar o kit" e "Revisar fotos"). */
export const screenTransition: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

/** Chegada de uma foto gerada: surge do desfoque, levemente menor. */
export const photoArrive: Variants = {
  hidden: { opacity: 0, scale: 0.94, filter: 'blur(8px)' },
  visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE } },
};

/** Item de lista (linhas do kit proposto); a reordenação usa `layout` do Framer Motion. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE } },
};

/** Versão para quem prefere menos movimento: só um fade rápido, sem deslocar, escalar ou desfocar. */
export function reduceVariants(_variants: Variants): Variants {
  return { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.12 } } };
}

const QUERY = '(prefers-reduced-motion: reduce)';

const canMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function subscribe(onChange: () => void) {
  if (!canMatchMedia()) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => canMatchMedia() && window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Variantes já ajustadas à preferência do sistema. Use estas nos componentes. */
export function useMotionPresets() {
  const reduced = usePrefersReducedMotion();
  return reduced
    ? {
        reduced,
        screenTransition: reduceVariants(screenTransition),
        photoArrive: reduceVariants(photoArrive),
        listItem: reduceVariants(listItem),
      }
    : { reduced, screenTransition, photoArrive, listItem };
}

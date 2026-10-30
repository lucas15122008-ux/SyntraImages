'use client';

import { useSyncExternalStore } from 'react';

const TAX_KEY = 'syntra.sim.tax';

// Imposto lembrado neste navegador; sem armazenamento, vale só nesta visita.
const taxListeners = new Set<() => void>();
let taxMemory: string | null = null;
function readTax(): string {
  if (taxMemory !== null) return taxMemory;
  try {
    return localStorage.getItem(TAX_KEY) ?? '0';
  } catch {
    return '0';
  }
}
function writeTax(v: string) {
  taxMemory = v;
  try {
    localStorage.setItem(TAX_KEY, v);
  } catch {
    // Sem armazenamento: fica na memória.
  }
  taxListeners.forEach((l) => l());
}
const subscribeTax = (l: () => void) => {
  taxListeners.add(l);
  return () => taxListeners.delete(l);
};

/** Imposto sobre a venda (%) digitado, o mesmo no simulador e em Produtos. */
export function useTax(): [string, (v: string) => void] {
  return [useSyncExternalStore(subscribeTax, readTax, () => '0'), writeTax];
}

import type { KitConfig, PhotoType, Slot } from './types';

export const MAX_TOTAL = 16;
/** Menor total possível (loja desligada): capa mais uma foto do meio. */
export const MIN_TOTAL = 2;
const STORE_PHOTOS = 2;

/** Tipos que mostram um lado que a foto original provavelmente não tem. */
export const ANGLE_WARNING_TYPES: ReadonlySet<PhotoType> = new Set<PhotoType>(['white_back', 'use_installed']);

export const PHOTO_TYPES: readonly PhotoType[] = [
  'white_front',
  'white_side',
  'white_detail',
  'use_hand',
  'white_on_box',
  'white_back',
  'use_installed',
];

export function minTotal(includeStore: boolean): number {
  return MIN_TOTAL + (includeStore ? STORE_PHOTOS : 0);
}

export function defaultMiddleTypes(count: number): PhotoType[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => PHOTO_TYPES[i % PHOTO_TYPES.length]);
}

function middleCount(c: Pick<KitConfig, 'total' | 'includeStore'>): number {
  return c.total - 1 - (c.includeStore ? STORE_PHOTOS : 0);
}

export function validateConfig(c: KitConfig): string[] {
  const errors: string[] = [];
  if (c.coverWithCar) {
    if (!c.car?.model.trim()) errors.push('Informe o modelo do carro para a capa com carro.');
    if (!c.car?.year.trim()) errors.push('Informe o ano do carro para a capa com carro.');
  }
  if (c.types.some((t) => !PHOTO_TYPES.includes(t))) errors.push('Há um tipo de foto desconhecido na configuração.');
  const min = minTotal(c.includeStore);
  if (!Number.isInteger(c.total)) {
    errors.push('A quantidade de fotos precisa ser um número inteiro.');
  } else if (c.total < min) {
    errors.push(`O kit precisa de pelo menos ${min} fotos${c.includeStore ? ' com as fotos da loja' : ''}.`);
  } else if (c.total > MAX_TOTAL) {
    errors.push(`O kit pode ter no máximo ${MAX_TOTAL} fotos.`);
  }
  return errors;
}

export function planKit(c: KitConfig): Slot[] {
  const middle = middleCount(c);
  const defaults = defaultMiddleTypes(middle);
  const slots: Slot[] = [{ position: 1, kind: 'cover', warnMissingAngle: false }];
  for (let i = 0; i < middle; i++) {
    const type = c.types[i] ?? defaults[i];
    slots.push({ position: i + 2, kind: 'generated', type, warnMissingAngle: ANGLE_WARNING_TYPES.has(type) });
  }
  if (c.includeStore) {
    slots.push({ position: slots.length + 1, kind: 'fixed', fixedIndex: 0, warnMissingAngle: false });
    slots.push({ position: slots.length + 1, kind: 'fixed', fixedIndex: 1, warnMissingAngle: false });
  }
  return slots;
}

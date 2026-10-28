import type { PhotoType } from './types';

export const TYPE_LABELS: Record<PhotoType, string> = {
  white_front: 'Frente, fundo branco',
  white_side: 'Lateral, fundo branco',
  white_detail: 'Detalhe de perto, fundo branco',
  white_back: 'Ângulo de trás, fundo branco',
  white_on_box: 'Peça em cima da embalagem',
  use_hand: 'Mecânico segurando a peça',
  use_installed: 'Peça instalada no carro',
  custom: 'Personalizada',
};

export const STORE_LABELS = ['Loja: apresentação', 'Loja: garantia e envio'] as const;

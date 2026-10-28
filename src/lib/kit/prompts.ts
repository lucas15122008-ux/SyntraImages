import { MODEL_MAX_INPUT_IMAGES } from './model';
import type { PhotoType, Slot } from './types';

export type PromptContext = {
  productName: string;
  car?: { model: string; year: string };
  hasExtraReference: boolean;
};

export type BuiltPrompt = { text: string; imageRoles: Array<'product' | 'extra'> };

const FIDELITY =
  'A peça deve ser idêntica à da foto de referência: não altere formato, cor, furos, marcações ou logotipos. Não invente nem remova nenhum detalhe da peça.';

const FORMAT = 'Imagem quadrada, peça centralizada e inteira no quadro, sem texto, sem marca d\'água e sem molduras.';

const WHITE = 'fundo branco de estúdio, iluminação suave e uniforme, sombra leve sob a peça';

const BY_TYPE: Record<Exclude<PhotoType, 'custom'>, string> = {
  white_front: `Foto de e-commerce da peça vista de frente, em ${WHITE}.`,
  white_side: `Foto de e-commerce da peça vista de lado, em ${WHITE}.`,
  white_detail: `Foto de e-commerce em close de um detalhe importante da peça (furos, rosca, encaixes ou acabamento), em ${WHITE}.`,
  white_back: `Foto de e-commerce da peça vista por trás, em ${WHITE}.`,
  white_on_box: `Foto de e-commerce da peça apoiada ao lado de uma caixa de papelão neutra, sem marca nem texto na caixa, em ${WHITE}.`,
  use_hand:
    'Foto de uso: uma mão humana com cinco dedos naturais, bem formados e proporcionais, segurando a peça numa oficina mecânica limpa e bem iluminada, com o fundo levemente desfocado.',
  use_installed:
    'Foto de uso: a peça instalada no compartimento do motor de um carro, numa oficina mecânica limpa e bem iluminada, com o fundo levemente desfocado.',
};

function cover(car?: PromptContext['car']): string {
  if (car) {
    return `Foto de capa de e-commerce: a peça em primeiro plano, junto com um ${car.model} ${car.year} compatível, em ${WHITE}. O carro deve aparecer ao fundo, menor que a peça, sem cobrir a peça.`;
  }
  return `Foto de capa de e-commerce: somente a peça, sem carro, em ${WHITE}.`;
}

export function buildPrompt(slot: Slot, ctx: PromptContext): BuiltPrompt {
  if (slot.kind === 'fixed') throw new Error('Fotos fixas da loja não passam pela IA.');

  let scene: string;
  if (slot.kind === 'cover') {
    scene = cover(ctx.car);
  } else {
    if (!slot.type) throw new Error('A foto gerada precisa de um tipo.');
    if (slot.type === 'custom') {
      if (!slot.custom?.prompt.trim()) throw new Error('A foto personalizada precisa de uma descrição.');
      // A cena vem antes das regras de fidelidade: a equipe escolhe o cenário, nunca muda a peça.
      scene = `Foto de e-commerce com esta cena, descrita pela equipe: ${slot.custom.prompt.trim()}`;
    } else {
      scene = BY_TYPE[slot.type];
    }
  }

  const useExtra = ctx.hasExtraReference && MODEL_MAX_INPUT_IMAGES >= 2;
  const imageRoles: BuiltPrompt['imageRoles'] = useExtra ? ['product', 'extra'] : ['product'];

  const parts = [
    `Produto: ${ctx.productName}.`,
    useExtra
      ? 'A primeira imagem é a foto de referência da peça. A segunda imagem é só uma referência extra de estilo, cena ou carro: use-a como inspiração, nunca para alterar a peça.'
      : 'A imagem enviada é a foto de referência da peça.',
    scene,
    FIDELITY,
    FORMAT,
  ];
  return { text: parts.join('\n'), imageRoles };
}

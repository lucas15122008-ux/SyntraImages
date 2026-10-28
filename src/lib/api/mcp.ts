import 'server-only';
import sharp from 'sharp';
import type { KitStore } from '@/lib/kit/store';
import { PHOTO_TYPES } from '@/lib/kit/plan';
import { ApiInputError, createKitFromRequest, generatePositions, kitView, photoTypesHelp, positionsToGenerate, type KitRequest } from './kits';

/**
 * Servidor MCP mínimo (JSON-RPC sobre HTTP, sem estado), em cima da mesma API de fotos.
 * É o que deixa o Claude criar e revisar kits direto na conversa.
 */

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const THUMB_SIZE = 512;

export type McpContext = {
  store: KitStore;
  origin: string;
  /** Roda depois da resposta (no Next, `after`): é onde a geração acontece. */
  background: (task: () => Promise<void>) => void;
  /** Miniatura para o Claude ver a foto; trocável nos testes. */
  thumbnail?: (bytes: Uint8Array) => Promise<string>;
};

type JsonRpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean };

const kitIdArg = { type: 'string', description: 'O id do kit, devolvido por criar_kit_de_fotos ou listar_kits.' };

export const TOOLS = [
  {
    name: 'criar_kit_de_fotos',
    title: 'Criar kit de fotos',
    description:
      'Cria um kit de fotos de anúncio (Mercado Livre) a partir de UMA foto da peça e começa a gerar com IA. Responde na hora com o id do kit; ' +
      'as fotos ficam prontas em cerca de 1 minuto (cada uma leva de 12 a 35 s). Depois use ver_kit para acompanhar e ver as fotos. ' +
      'Padrão: 10 fotos (capa, 7 fotos variadas e as 2 artes fixas da loja no fim). Cada foto gerada custa cerca de US$ 0,01 e conta no limite diário da equipe.',
    inputSchema: {
      type: 'object',
      properties: {
        produto: { type: 'string', description: 'Nome do produto, como no anúncio. Ex.: "Bomba de óleo Gol 1.0".' },
        foto_url: { type: 'string', description: 'Link público da foto da peça (JPEG, PNG ou WEBP, até 10 MB). Ex.: foto do fornecedor ou de um anúncio.' },
        foto_base64: { type: 'string', description: 'Alternativa a foto_url: a imagem em base64 (pode ter o prefixo data:).' },
        referencia_url: { type: 'string', description: 'Opcional: link de uma segunda imagem de referência da mesma peça (outro ângulo).' },
        carro: {
          type: 'object',
          description: 'Opcional: carro compatível para aparecer na capa. Sem isso, a capa é só a peça.',
          properties: { modelo: { type: 'string', description: 'Ex.: "Gol G5"' }, ano: { type: 'string', description: 'Ex.: "2012"' } },
          required: ['modelo', 'ano'],
        },
        total: { type: 'integer', minimum: 2, maximum: 16, description: 'Total de fotos do kit, contando capa e artes da loja. Padrão 10.' },
        fotos_da_loja: { type: 'boolean', description: 'Coloca as 2 artes fixas da loja no fim do kit. Padrão true.' },
        tipos: {
          type: 'array',
          description:
            'Opcional: as fotos entre a capa e as da loja, em ordem. Cada item é um tipo pronto ou uma cena livre {"nome", "descricao"}. ' +
            'Sem isso, o app escolhe uma mistura. Veja tipos_de_foto.',
          items: {
            anyOf: [
              { type: 'string', enum: [...PHOTO_TYPES] },
              {
                type: 'object',
                properties: { nome: { type: 'string' }, descricao: { type: 'string', description: 'A cena, em português, até 600 caracteres.' } },
                required: ['descricao'],
              },
            ],
          },
        },
      },
      required: ['produto'],
    },
  },
  {
    name: 'ver_kit',
    title: 'Ver kit',
    description:
      'Mostra a situação de um kit: quais fotos estão prontas, gerando ou falharam, com links (válidos por 1 hora) e, se pedir, as próprias fotos para você conferir ' +
      'se a peça ficou fiel à original. Se o status for "gerando", espere uns 20 segundos e chame de novo.',
    inputSchema: {
      type: 'object',
      properties: {
        kit_id: kitIdArg,
        mostrar_fotos: { type: 'boolean', description: 'Devolve as fotos prontas como imagens (miniaturas de 512 px). Padrão true.' },
      },
      required: ['kit_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'refazer_fotos',
    title: 'Refazer fotos',
    description:
      'Gera de novo fotos de um kit. Sem "posicoes": tenta de novo as que falharam ou ficaram pendentes. Com "posicoes": refaz essas (ex.: a peça saiu diferente). ' +
      'As artes da loja não são geradas. Cada foto refeita custa de novo.',
    inputSchema: {
      type: 'object',
      properties: {
        kit_id: kitIdArg,
        posicoes: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'Posições a refazer (a capa é a 1).' },
      },
      required: ['kit_id'],
    },
  },
  {
    name: 'listar_kits',
    title: 'Listar kits',
    description: 'Os kits mais recentes da conta, com id e link para abrir no app.',
    inputSchema: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Padrão 10.' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'tipos_de_foto',
    title: 'Tipos de foto',
    description: 'Os tipos de foto prontos, os padrões do kit e os limites de quantidade.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
] as const;

const text = (value: unknown): Content => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) });

async function defaultThumbnail(bytes: Uint8Array): Promise<string> {
  const out = await sharp(bytes).resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  return out.toString('base64');
}

async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext): Promise<ToolResult> {
  const { store, origin } = ctx;
  switch (name) {
    case 'criar_kit_de_fotos': {
      const { kitId, positions } = await createKitFromRequest(args as KitRequest, { store });
      ctx.background(() => generatePositions(store, kitId, positions));
      const view = await kitView(store, (await store.getKit(kitId))!, origin);
      return {
        content: [
          text(`Kit criado (id ${kitId}). ${positions.length} fotos estão sendo geradas; fica pronto em cerca de 1 minuto. Chame ver_kit com esse id para acompanhar.`),
          text(view),
        ],
      };
    }
    case 'ver_kit': {
      const kit = await store.getKit(String(args.kit_id ?? '')).catch(() => null);
      if (!kit) throw new ApiInputError('Kit não encontrado.');
      const view = await kitView(store, kit, origin);
      const content: Content[] = [text(view)];
      if (args.mostrar_fotos !== false) {
        const photos = await store.listPhotos(kit.id);
        const thumb = ctx.thumbnail ?? defaultThumbnail;
        for (const p of photos) {
          // As artes da loja são sempre as mesmas: não vale gastar contexto com elas.
          if (p.kind === 'fixed' || !p.storage_path) continue;
          const v = view.fotos.find((f) => f.posicao === p.position)!;
          if (!v.url) continue;
          content.push(text(`Foto ${p.position}: ${v.nome}${v.aviso_angulo ? ' (ângulo que a foto original talvez não mostre: confira)' : ''}`));
          content.push({ type: 'image', mimeType: 'image/jpeg', data: await thumb(await store.getFile('generated', p.storage_path)) });
        }
      }
      return { content };
    }
    case 'refazer_fotos': {
      const kitId = String(args.kit_id ?? '');
      const kit = await store.getKit(kitId).catch(() => null);
      if (!kit) throw new ApiInputError('Kit não encontrado.');
      const positions = await positionsToGenerate(store, kitId, args.posicoes);
      if (!positions.length) return { content: [text('Nada para refazer: nenhuma foto pendente ou com falha. Para refazer uma foto pronta, informe "posicoes".')] };
      ctx.background(() => generatePositions(store, kitId, positions));
      return { content: [text(`Refazendo as fotos ${positions.join(', ')}. Chame ver_kit em cerca de 30 segundos.`)] };
    }
    case 'listar_kits': {
      const limit = Math.min(50, Math.max(1, Number(args.limite) || 10));
      const kits = await store.listKits(limit);
      return {
        content: [
          text(kits.map((k) => ({ id: k.id, produto: k.product_name, criado_em: k.created_at ?? null, link_no_app: `${origin}/kits/${k.id}` }))),
        ],
      };
    }
    case 'tipos_de_foto':
      return { content: [text(photoTypesHelp())] };
    default:
      throw new McpError(-32602, `Ferramenta desconhecida: ${name}`);
  }
}

class McpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/** Responde a uma mensagem JSON-RPC. Devolve null para notificações (sem resposta). */
export async function handleMcpMessage(msg: JsonRpcRequest, ctx: McpContext): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  const reply = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result });
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(-32600, 'Pedido JSON-RPC inválido.');
  if (isNotification) return null;

  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = String(msg.params?.protocolVersion ?? '');
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'syntra-images', title: 'Syntra Images', version: '1.0.0' },
          instructions:
            'Gera kits de fotos de anúncio de autopeças a partir de uma foto da peça. Fluxo: criar_kit_de_fotos, esperar cerca de 1 minuto, ver_kit para conferir ' +
            'se a peça ficou fiel à original, refazer_fotos nas que ficaram diferentes. O kit também aparece no app do Syntra para revisão e download.',
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          return reply(await callTool(name, args, ctx));
        } catch (e) {
          if (e instanceof McpError) throw e;
          // Erro da ferramenta: vai como resultado, para o Claude ler e corrigir o pedido.
          const known = e instanceof ApiInputError || (e instanceof Error && /limite diário/i.test(e.message));
          if (!known) console.error('MCP de fotos:', e);
          return reply({ content: [text(known ? (e as Error).message : 'Erro inesperado no servidor do Syntra. Tente de novo.')], isError: true });
        }
      }
      default:
        return error(-32601, `Método não suportado: ${msg.method}`);
    }
  } catch (e) {
    if (e instanceof McpError) return error(e.code, e.message);
    return error(-32603, 'Erro interno.');
  }
}

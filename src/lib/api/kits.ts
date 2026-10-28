import 'server-only';
import { isReadyForDownload } from '@/lib/kit/download';
import { createKit, generatePhoto, type GenerateFn } from '@/lib/kit/generate';
import { MAX_IMAGE_BYTES } from '@/lib/kit/image';
import { STORE_LABELS, TYPE_LABELS } from '@/lib/kit/labels';
import { isStaleGeneration } from '@/lib/kit/limits';
import { ALL_PHOTO_TYPES, CUSTOM_DEFAULT_LABEL, MAX_TOTAL, defaultMiddleTypes, minTotal } from '@/lib/kit/plan';
import type { KitRow, KitStore, PhotoRow } from '@/lib/kit/store';
import type { CustomPhoto, KitConfig, PhotoType } from '@/lib/kit/types';

/** Erro do pedido (400): a mensagem vai como está para quem chamou. */
export class ApiInputError extends Error {}

const DEFAULT_TOTAL = 10;
const FETCH_TIMEOUT_MS = 20_000;
/** Gerações em paralelo num mesmo kit: o kit de 10 fica pronto em cerca de 1 minuto. */
const CONCURRENCY = 5;
const URL_SECONDS = 3600;

/** Como a foto chega: link público ou o arquivo em base64. */
export type ImageSource = { url: string } | { base64: string } | { file: File };

/** Corpo de "criar kit", com os nomes da API (em português, como o app). */
export type KitRequest = {
  produto?: unknown;
  foto_url?: unknown;
  foto_base64?: unknown;
  referencia_url?: unknown;
  referencia_base64?: unknown;
  total?: unknown;
  carro?: unknown;
  fotos_da_loja?: unknown;
  tipos?: unknown;
};

export type ParsedKitRequest = {
  productName: string;
  config: KitConfig;
  image: ImageSource;
  extra?: ImageSource;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function source(url: unknown, base64: unknown, label: string): ImageSource | undefined {
  if (str(url)) return { url: str(url) };
  if (str(base64)) return { base64: str(base64) };
  if (url !== undefined || base64 !== undefined) throw new ApiInputError(`Informe ${label} por link (_url) ou em base64 (_base64).`);
  return undefined;
}

/**
 * Valida o pedido e monta a configuração do kit com os mesmos padrões da tela: 10 fotos,
 * fotos da loja no fim, capa com carro quando o carro é informado e a mistura de tipos sugerida.
 */
export function parseKitRequest(body: KitRequest): ParsedKitRequest {
  if (!body || typeof body !== 'object') throw new ApiInputError('Envie um JSON com os dados do kit.');
  const productName = str(body.produto);
  if (!productName) throw new ApiInputError('Informe o nome do produto em "produto".');
  const image = source(body.foto_url, body.foto_base64, 'a foto do produto');
  if (!image) throw new ApiInputError('Envie a foto do produto em "foto_url" (link) ou "foto_base64".');
  const extra = source(body.referencia_url, body.referencia_base64, 'a imagem de referência');

  const includeStore = body.fotos_da_loja === undefined ? true : body.fotos_da_loja === true;
  const total = body.total === undefined ? DEFAULT_TOTAL : Number(body.total);
  if (!Number.isInteger(total) || total < minTotal(includeStore) || total > MAX_TOTAL) {
    throw new ApiInputError(`"total" precisa ser um número inteiro de ${minTotal(includeStore)} a ${MAX_TOTAL} (contando capa e fotos da loja).`);
  }

  let car: { model: string; year: string } | undefined;
  if (body.carro !== undefined && body.carro !== null) {
    const c = body.carro as { modelo?: unknown; ano?: unknown };
    car = { model: str(c?.modelo), year: str(c?.ano) };
    if (!car.model || !car.year) throw new ApiInputError('Em "carro", informe "modelo" e "ano" (ou não mande "carro" para a capa sem carro).');
  }

  const middle = total - 1 - (includeStore ? 2 : 0);
  const types: PhotoType[] = defaultMiddleTypes(middle);
  const custom: Array<CustomPhoto | null> = types.map(() => null);
  if (body.tipos !== undefined) {
    if (!Array.isArray(body.tipos)) throw new ApiInputError('"tipos" precisa ser uma lista.');
    if (body.tipos.length > middle) {
      throw new ApiInputError(`"tipos" tem ${body.tipos.length} itens, mas o kit só tem ${middle} fotos entre a capa e as da loja.`);
    }
    body.tipos.forEach((t: unknown, i: number) => {
      if (typeof t === 'string') {
        if (!(ALL_PHOTO_TYPES as readonly string[]).includes(t) || t === 'custom') {
          throw new ApiInputError(`Tipo de foto desconhecido: "${t}". Para uma cena livre, mande {"descricao": "..."}.`);
        }
        types[i] = t as PhotoType;
      } else if (t && typeof t === 'object' && str((t as { descricao?: unknown }).descricao)) {
        types[i] = 'custom';
        custom[i] = { label: str((t as { nome?: unknown }).nome) || CUSTOM_DEFAULT_LABEL, prompt: str((t as { descricao?: unknown }).descricao) };
      } else {
        throw new ApiInputError(`O item ${i + 1} de "tipos" precisa ser um tipo pronto ou {"nome": "...", "descricao": "..."}.`);
      }
    });
  }

  return {
    productName,
    image,
    extra,
    config: {
      total,
      coverWithCar: !!car,
      car,
      useExtraReference: !!extra,
      includeStore,
      types,
      ...(custom.some(Boolean) ? { custom } : {}),
    },
  };
}

/** Só endereços públicos: nada de localhost ou rede interna. */
function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiInputError(`Link de imagem inválido: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ApiInputError('O link da imagem precisa começar com http:// ou https://.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === '::1' ||
    /^f[cd]/.test(host) ||
    /^fe80:/.test(host);
  if (privateHost) throw new ApiInputError('O link da imagem precisa ser de um endereço público.');
  return url;
}

/** Baixa ou decodifica a imagem. O formato e o tamanho são conferidos depois, no `createKit`. */
export async function loadImage(src: ImageSource, label: string, fetchFn: typeof fetch = fetch): Promise<File> {
  if ('file' in src) return src.file;
  if ('base64' in src) {
    const data = src.base64.replace(/^data:[^,]*,/, '');
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) throw new ApiInputError(`A ${label} em base64 está vazia ou inválida.`);
    return new File([new Uint8Array(bytes) as BlobPart], label);
  }
  const url = assertPublicUrl(src.url);
  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow', headers: { accept: 'image/*' } });
  } catch {
    throw new ApiInputError(`Não foi possível baixar a ${label} (${url.hostname}).`);
  }
  if (!res.ok) throw new ApiInputError(`O link da ${label} respondeu ${res.status}.`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new ApiInputError(`A ${label} passa de 10 MB.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return new File([bytes as BlobPart], label);
}

/** Valida tudo, baixa as imagens e cria o kit com as fotos pendentes. A geração é à parte. */
export async function createKitFromRequest(
  body: KitRequest,
  deps: { store: KitStore; fetch?: typeof fetch; files?: { foto?: File; referencia?: File } },
): Promise<{ kitId: string; positions: number[] }> {
  const files = deps.files ?? {};
  // Envio por formulário (multipart): o arquivo vale como a foto, no lugar de link ou base64.
  const req = parseKitRequest(files.foto ? { ...body, foto_url: undefined, foto_base64: 'arquivo' } : body);
  if (files.foto) req.image = { file: files.foto };
  if (files.referencia) {
    req.extra = { file: files.referencia };
    req.config.useExtraReference = true;
  }
  const original = await loadImage(req.image, 'foto do produto', deps.fetch);
  const extraReference = req.extra ? await loadImage(req.extra, 'imagem de referência', deps.fetch) : undefined;
  let kitId: string;
  try {
    ({ kitId } = await createKit({ productName: req.productName, config: req.config, original, extraReference }, { store: deps.store }));
  } catch (e) {
    // As mensagens do createKit já explicam o que corrigir (formato, tamanho, artes da loja).
    throw new ApiInputError(e instanceof Error ? e.message : 'Não foi possível criar o kit.');
  }
  const photos = await deps.store.listPhotos(kitId);
  return { kitId, positions: photos.filter((p) => p.kind !== 'fixed').map((p) => p.position) };
}

/**
 * Quais posições gerar: as pedidas, ou todas as que ainda não têm foto boa. Valida antes de
 * começar para que um pedido errado volte como erro e não como foto falhada.
 */
export async function positionsToGenerate(store: KitStore, kitId: string, wanted?: unknown): Promise<number[]> {
  const photos = await store.listPhotos(kitId);
  if (!photos.length) throw new ApiInputError('Kit não encontrado.');
  const generatable = photos.filter((p) => p.kind !== 'fixed');
  if (wanted === undefined || wanted === null) {
    return generatable.filter((p) => p.status === 'pending' || p.status === 'failed').map((p) => p.position);
  }
  if (!Array.isArray(wanted) || !wanted.length || wanted.some((n) => !Number.isInteger(n))) {
    throw new ApiInputError('"posicoes" precisa ser uma lista de números, por exemplo [2, 5].');
  }
  const valid = new Set(generatable.map((p) => p.position));
  const bad = (wanted as number[]).filter((n) => !valid.has(n));
  if (bad.length) {
    throw new ApiInputError(`Posição ${bad.join(', ')} não pode ser gerada. Use de 1 a ${photos.length}, menos as fotos fixas da loja.`);
  }
  return [...new Set(wanted as number[])];
}

/**
 * Gera as fotos, algumas em paralelo. Uma falha fica registrada na própria foto. Quando o
 * teto diário estoura, as que faltam viram "falhou" com o motivo, para não ficarem esperando.
 */
export async function generatePositions(
  store: KitStore,
  kitId: string,
  positions: number[],
  deps: { generate?: GenerateFn; concurrency?: number } = {},
): Promise<void> {
  const queue = [...positions];
  let stopped: string | null = null;
  const worker = async () => {
    while (!stopped && queue.length) {
      const position = queue.shift()!;
      try {
        await generatePhoto(kitId, position, { store, generate: deps.generate });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Não foi possível gerar a foto.';
        if (/limite diário/i.test(message)) stopped = message;
        const photo = await store.getPhoto(kitId, position).catch(() => null);
        if (photo && photo.status !== 'generating') await store.updatePhoto(photo.id, { status: 'failed', error: message }).catch(() => {});
      }
    }
    while (stopped && queue.length) {
      const photo = await store.getPhoto(kitId, queue.shift()!).catch(() => null);
      if (photo && photo.status === 'pending') await store.updatePhoto(photo.id, { status: 'failed', error: stopped }).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? CONCURRENCY, queue.length) }, worker));
}

export type PhotoStatusView = {
  posicao: number;
  tipo: string;
  nome: string;
  status: 'pendente' | 'gerando' | 'pronta' | 'falhou';
  url: string | null;
  erro: string | null;
  aviso_angulo: boolean;
  tentativas: number;
};

export type KitView = {
  id: string;
  produto: string;
  carro: { modelo: string; ano: string } | null;
  criado_em: string | null;
  status: 'gerando' | 'pronto' | 'com_falhas' | 'parado';
  prontas: number;
  total: number;
  link_no_app: string;
  fotos: PhotoStatusView[];
};

const STATUS_PT = { pending: 'pendente', generating: 'gerando', done: 'pronta', failed: 'falhou' } as const;

function photoName(p: PhotoRow, fixedIndex: number): { tipo: string; nome: string } {
  if (p.kind === 'cover') return { tipo: 'capa', nome: 'Capa' };
  if (p.kind === 'fixed') return { tipo: 'loja', nome: STORE_LABELS[Math.min(fixedIndex, 1)] };
  if (p.type === 'custom') return { tipo: 'custom', nome: p.custom_label || CUSTOM_DEFAULT_LABEL };
  return { tipo: p.type ?? 'foto', nome: p.type ? TYPE_LABELS[p.type] : 'Foto' };
}

/** Situação do kit com links temporários (1 hora) para cada foto pronta. */
export async function kitView(store: KitStore, kit: KitRow, appOrigin: string, now = new Date()): Promise<KitView> {
  const photos = await store.listPhotos(kit.id);
  const firstFixed = photos.findIndex((p) => p.kind === 'fixed');
  const fotos = await Promise.all(
    photos.map(async (p, i): Promise<PhotoStatusView> => {
      const ready = !!p.storage_path && isReadyForDownload(p.status, true);
      const url = ready ? await store.signedUrl(p.kind === 'fixed' ? 'store' : 'generated', p.storage_path!, URL_SECONDS) : null;
      return {
        posicao: p.position,
        ...photoName(p, i - firstFixed),
        status: STATUS_PT[p.status],
        url,
        erro: p.error,
        aviso_angulo: p.warn_missing_angle && !p.warn_dismissed,
        tentativas: p.attempts,
      };
    }),
  );
  const ready = photos.filter((p) => !!p.storage_path && isReadyForDownload(p.status, true)).length;
  const running = photos.some((p) => p.status === 'generating' && !isStaleGeneration(p.status, p.generating_since?.toISOString() ?? null, now));
  const waiting = photos.some((p) => p.status === 'pending');
  const failed = photos.some((p) => p.status === 'failed');
  // Pendente sem nada gerando há mais de 6 min: o servidor parou no meio. Gerar de novo retoma.
  const old = kit.created_at ? now.getTime() - new Date(kit.created_at).getTime() > 6 * 60_000 : false;
  const status: KitView['status'] = running ? 'gerando' : waiting ? (old ? 'parado' : 'gerando') : failed ? 'com_falhas' : 'pronto';
  return {
    id: kit.id,
    produto: kit.product_name,
    carro: kit.car_model && kit.car_year ? { modelo: kit.car_model, ano: kit.car_year } : null,
    criado_em: kit.created_at ?? null,
    status,
    prontas: ready,
    total: photos.length,
    link_no_app: `${appOrigin}/kits/${kit.id}`,
    fotos,
  };
}

/** Lista dos tipos prontos, para quem monta o pedido. */
export function photoTypesHelp() {
  return {
    tipos: ALL_PHOTO_TYPES.filter((t) => t !== 'custom').map((t) => ({ tipo: t, nome: TYPE_LABELS[t] })),
    personalizada: 'Para uma cena livre, use {"nome": "Peça na bancada", "descricao": "a peça sobre uma bancada de oficina..."} no lugar do tipo.',
    padrao: {
      total: DEFAULT_TOTAL,
      fotos_da_loja: true,
      tipos_sugeridos: defaultMiddleTypes(DEFAULT_TOTAL - 3),
    },
    limites: { total_min_com_loja: minTotal(true), total_min_sem_loja: minTotal(false), total_max: MAX_TOTAL },
  };
}

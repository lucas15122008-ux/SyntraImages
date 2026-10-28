import 'server-only';
import { GenerationError, generateImage, type GeneratedImage, type ImageInput } from '@/lib/openrouter/client';
import { STALE_GENERATION_MS } from './limits';
import { IMAGE_EXT as EXT, readImage, sniffImageMime, type ImageMime as Mime } from './image';
import { buildPrompt } from './prompts';
import { planKit, validateConfig } from './plan';
import { getKitStore, type KitStore } from './store';
import type { KitConfig } from './types';

const DEFAULT_DAILY_LIMIT = 200;

/** Meia-noite de Brasília (UTC-3, sem horário de verão) do dia de `now`, como instante UTC. */
export function startOfDayBR(now: Date): Date {
  const shifted = new Date(now.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 3));
}

function dailyLimit(): number {
  const n = Number(process.env.DAILY_GENERATION_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

export type GenerateFn = (req: { prompt: string; images: ImageInput[] }) => Promise<GeneratedImage>;

export type CreateKitInput = {
  productName: string;
  config: KitConfig;
  original: File;
  extraReference?: File;
};

export async function createKit(input: CreateKitInput, deps: { store?: KitStore } = {}): Promise<{ kitId: string }> {
  const store = deps.store ?? (await getKitStore());

  // Toda a validação acontece antes de gravar qualquer coisa.
  const productName = input.productName.trim();
  if (!productName) throw new Error('Informe o nome do produto.');
  const errors = validateConfig(input.config);
  if (errors.length) throw new Error(errors.join(' '));
  const original = await readImage(input.original, 'foto do produto');
  let extra: { bytes: Uint8Array; mime: Mime } | null = null;
  if (input.config.useExtraReference) {
    if (!input.extraReference) throw new Error('Envie a imagem de referência ou desligue a opção de referência.');
    extra = await readImage(input.extraReference, 'imagem de referência');
  }
  const assets = await store.getStoreAssets();
  if (input.config.includeStore && (!assets[0] || !assets[1])) {
    throw new Error('Suba as artes da loja em Configurações antes de criar um kit com as fotos da loja.');
  }

  const userId = await store.currentUserId();
  const kitId = crypto.randomUUID();
  const originalPath = `${userId}/${kitId}/original.${EXT[original.mime]}`;
  const extraPath = extra ? `${userId}/${kitId}/extra.${EXT[extra.mime]}` : null;
  const uploaded: string[] = [];
  let kitInserted = false;
  try {
    await store.putFile('originals', originalPath, original.bytes, original.mime);
    uploaded.push(originalPath);
    if (extra && extraPath) {
      await store.putFile('originals', extraPath, extra.bytes, extra.mime);
      uploaded.push(extraPath);
    }
    const car = input.config.coverWithCar ? input.config.car : undefined;
    await store.insertKit({
      id: kitId,
      product_name: productName,
      car_model: car?.model.trim() ?? null,
      car_year: car?.year.trim() ?? null,
      config: input.config,
      original_path: originalPath,
      extra_reference_path: extraPath,
    });
    kitInserted = true;
    await store.insertPhotos(
      planKit(input.config).map((slot) => {
        const asset = slot.kind === 'fixed' ? assets[slot.fixedIndex!] : null;
        return {
          kit_id: kitId,
          position: slot.position,
          kind: slot.kind,
          type: slot.type ?? null,
          // Só manda as colunas novas quando há foto personalizada: kits comuns continuam
          // funcionando mesmo antes de a migração 0007 rodar.
          ...(slot.custom ? { custom_label: slot.custom.label, custom_prompt: slot.custom.prompt } : {}),
          status: asset ? ('done' as const) : ('pending' as const),
          storage_path: asset?.storage_path ?? null,
          warn_missing_angle: slot.warnMissingAngle,
          warn_dismissed: false,
          attempts: 0,
          error: null,
          generating_since: null,
        };
      }),
    );
    return { kitId };
  } catch {
    if (kitInserted) await store.deleteKit(kitId).catch(() => {});
    for (const path of uploaded) await store.removeFile('originals', path).catch(() => {});
    throw new Error('Não foi possível criar o kit. Tente novamente.');
  }
}

function failureMessage(e: unknown): string {
  if (e instanceof GenerationError) return e.message;
  return 'A geração falhou por um erro inesperado. Tente refazer.';
}

/**
 * Gera (ou refaz) uma foto do kit. Uma geração por vez por foto; erros da geração ficam
 * registrados na própria foto (`failed`) e não derrubam as outras. Lança apenas para
 * pedidos inválidos ou quando o teto diário foi atingido.
 */
export async function generatePhoto(
  kitId: string,
  position: number,
  deps: { store?: KitStore; generate?: GenerateFn } = {},
): Promise<void> {
  const store = deps.store ?? (await getKitStore());
  const generate = deps.generate ?? generateImage;

  const kit = await store.getKit(kitId);
  if (!kit) throw new Error('Kit não encontrado.');
  const photo = await store.getPhoto(kitId, position);
  if (!photo) throw new Error('Foto não encontrada.');
  if (photo.kind === 'fixed') throw new Error('As fotos fixas da loja não são geradas.');

  const limit = dailyLimit();
  if ((await store.countGenerationsSince(startOfDayBR(new Date()))) >= limit) {
    throw new Error(`Limite diário de ${limit} gerações atingido. Tente de novo amanhã ou fale com o administrador.`);
  }

  const claimed = await store.claimPhoto(kitId, position, new Date(Date.now() - STALE_GENERATION_MS));
  if (!claimed) return; // outra geração desta foto já está em andamento

  try {
    await store.logGeneration(kitId, position);
    const images: ImageInput[] = [{ bytes: await store.getFile('originals', kit.original_path), mime: '' }];
    images[0].mime = sniffImageMime(images[0].bytes) ?? 'image/jpeg';
    const useExtra = kit.config.useExtraReference && !!kit.extra_reference_path;
    if (useExtra) {
      const bytes = await store.getFile('originals', kit.extra_reference_path!);
      images.push({ bytes, mime: sniffImageMime(bytes) ?? 'image/jpeg' });
    }

    const car = kit.config.coverWithCar && kit.car_model && kit.car_year ? { model: kit.car_model, year: kit.car_year } : undefined;
    const { text } = buildPrompt(
      {
        position,
        kind: photo.kind,
        type: photo.type ?? undefined,
        custom: photo.custom_prompt ? { label: photo.custom_label ?? '', prompt: photo.custom_prompt } : undefined,
        warnMissingAngle: photo.warn_missing_angle,
      },
      { productName: kit.product_name, car, hasExtraReference: useExtra },
    );

    const out = await generate({ prompt: text, images });
    const ext = EXT[out.mime as Mime] ?? 'jpg';
    const path = `${kit.owner}/${kitId}/${position}-${claimed.attempts}.${ext}`;
    await store.putFile('generated', path, out.bytes, out.mime);
    await store.updatePhoto(claimed.id, { status: 'done', storage_path: path, error: null, generating_since: null });
    if (photo.storage_path && photo.storage_path !== path) {
      await store.removeFile('generated', photo.storage_path).catch(() => {});
    }
  } catch (e) {
    await store.updatePhoto(claimed.id, { status: 'failed', error: failureMessage(e), generating_since: null });
  }
}

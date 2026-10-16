import 'server-only';

const ENDPOINT = 'https://openrouter.ai/api/v1/images';
const DEFAULT_MODEL = 'meta/muse-image';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1_000;

export type ImageInput = { bytes: Uint8Array; mime: string };
export type GeneratedImage = { bytes: Uint8Array; mime: string };

export type GenerateDeps = {
  fetch?: typeof fetch;
  apiKey?: string;
  model?: string;
  /** Tempo máximo de cada tentativa. */
  timeoutMs?: number;
  /** Repetições automáticas além da primeira tentativa, só para erros repetíveis. */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class GenerationError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, opts: { retryable: boolean; status?: number }) {
    super(message);
    this.name = 'GenerationError';
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

function errorFromStatus(status: number): GenerationError {
  const retryable = status === 429 || status >= 500;
  const message =
    status === 429
      ? 'O serviço de imagens está sobrecarregado (limite de requisições). Tente refazer em instantes.'
      : status >= 500
        ? `O serviço de imagens falhou (HTTP ${status}). Tente refazer em instantes.`
        : status === 401 || status === 403
          ? 'O serviço de imagens recusou a chave configurada no servidor.'
          : status === 402
            ? 'Sem saldo no serviço de imagens.'
            : `O serviço de imagens recusou o pedido (HTTP ${status}).`;
  return new GenerationError(message, { retryable, status });
}

async function attempt(
  body: string,
  apiKey: string,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<GeneratedImage> {
  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new GenerationError(
      timedOut ? 'A geração passou do tempo limite.' : 'Não foi possível falar com o serviço de imagens.',
      { retryable: true },
    );
  }
  if (!res.ok) throw errorFromStatus(res.status);

  let json: { data?: Array<{ b64_json?: string; media_type?: string }> };
  try {
    json = await res.json();
  } catch {
    throw new GenerationError('Resposta inválida do serviço de imagens.', { retryable: false, status: res.status });
  }
  const item = json.data?.[0];
  if (!item?.b64_json) {
    throw new GenerationError('O serviço respondeu sem nenhuma imagem.', { retryable: false, status: res.status });
  }
  return { bytes: new Uint8Array(Buffer.from(item.b64_json, 'base64')), mime: item.media_type ?? 'image/jpeg' };
}

/** Gera uma imagem quadrada a partir do prompt e das imagens de referência. Só roda no servidor. */
export async function generateImage(
  req: { prompt: string; images: ImageInput[] },
  deps: GenerateDeps = {},
): Promise<GeneratedImage> {
  const apiKey = deps.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new GenerationError('A chave do serviço de imagens não está configurada no servidor.', { retryable: false });

  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify({
    model: deps.model ?? process.env.OPENROUTER_IMAGE_MODEL ?? DEFAULT_MODEL,
    prompt: req.prompt,
    n: 1,
    aspect_ratio: '1:1',
    output_format: 'jpeg',
    input_references: req.images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${toB64(img.bytes)}` },
    })),
  });

  for (let tries = 0; ; tries++) {
    try {
      return await attempt(body, apiKey, doFetch, timeoutMs);
    } catch (e) {
      if (!(e instanceof GenerationError) || !e.retryable || tries >= maxRetries) throw e;
      await sleep(BASE_BACKOFF_MS * 2 ** tries);
    }
  }
}

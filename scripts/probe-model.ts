/**
 * Sonda o modelo de imagem no OpenRouter e imprime o que ele suporta.
 *
 * Uso (Node 24, sem dependências):
 *   OPENROUTER_API_KEY=... node scripts/probe-model.ts <foto1> [foto2]
 * A chave também pode ficar em .env.local (ignorado pelo git).
 * Resultados (imagens geradas) vão para scripts/out/ (ignorado pelo git).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const BASE = 'https://openrouter.ai/api/v1';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvLocal();

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_IMAGE_MODEL || 'meta/muse-image';
const [photo1, photo2] = process.argv.slice(2);
if (!apiKey) throw new Error('Defina OPENROUTER_API_KEY (variável de ambiente ou .env.local).');
if (!photo1) throw new Error('Informe ao menos uma foto: node scripts/probe-model.ts foto.jpg [foto2.jpg]');

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const toDataUrl = (path: string) => {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error(`Formato não suportado: ${path}`);
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
};

function dimensions(buf: Buffer): string {
  if (buf.subarray(1, 4).toString() === 'PNG') return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`;
      }
      i += 2 + len;
    }
  }
  if (buf.subarray(0, 4).toString() === 'RIFF') return 'webp (dimensões não lidas)';
  return 'desconhecido';
}

async function metadata() {
  console.log(`\n== Metadados de ${model} ==`);
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const json = (await res.json()) as { data?: Array<Record<string, any>> };
  const entry = json.data?.find((m) => m.id === model);
  if (!entry) {
    console.log('Slug NÃO encontrado na lista de modelos. Candidatos parecidos:');
    console.log((json.data ?? []).filter((m) => /muse/i.test(m.id)).map((m) => m.id));
    return;
  }
  console.log(JSON.stringify({ id: entry.id, name: entry.name, architecture: entry.architecture, pricing: entry.pricing, context_length: entry.context_length, supported_parameters: entry.supported_parameters }, null, 2));
}

async function generate(label: string, images: string[], prompt: string) {
  console.log(`\n== ${label} (${images.length} imagem(ns) de entrada) ==`);
  const body = {
    model,
    modalities: ['image', 'text'],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))],
      },
    ],
  };
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const text = await res.text();
  console.log(`HTTP ${res.status} em ${secs}s`);
  let json: any;
  try { json = JSON.parse(text); } catch { console.log(text.slice(0, 800)); return; }
  if (!res.ok) { console.log(JSON.stringify(json, null, 2).slice(0, 1500)); return; }
  const msg = json.choices?.[0]?.message;
  const urls: string[] = (msg?.images ?? []).map((i: any) => i.image_url?.url).filter(Boolean);
  console.log('texto:', typeof msg?.content === 'string' ? msg.content.slice(0, 300) : msg?.content);
  console.log('usage:', JSON.stringify(json.usage));
  mkdirSync('scripts/out', { recursive: true });
  urls.forEach((u, idx) => {
    const m = u.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
    if (!m) { console.log('imagem em URL:', u.slice(0, 120)); return; }
    const buf = Buffer.from(m[2], 'base64');
    const file = `scripts/out/${label.replace(/\W+/g, '-')}-${idx}.${m[1].split('/')[1]}`;
    writeFileSync(file, buf);
    console.log(`imagem salva: ${file} — ${m[1]}, ${buf.length} bytes, ${dimensions(buf)}`);
  });
  if (!urls.length) console.log('Nenhuma imagem na resposta:', JSON.stringify(json).slice(0, 800));
}

const PROMPT_1 = 'Foto de estúdio profissional desta peça automotiva em fundo branco, quadrada, peça centralizada, idêntica à da foto de referência (mesmo formato, cor, furos e marcações). Sem texto nem marca d\'água.';
const PROMPT_2 = 'Use a primeira imagem como a peça (deve ficar idêntica) e a segunda como referência de cena/estilo. Gere uma foto quadrada de e-commerce da peça nessa cena. Sem texto nem marca d\'água.';

await metadata();
await generate('uma-imagem', [toDataUrl(photo1)], PROMPT_1);
if (photo2) await generate('duas-imagens', [toDataUrl(photo1), toDataUrl(photo2)], PROMPT_2);
else await generate('duas-imagens-mesma-foto', [toDataUrl(photo1), toDataUrl(photo1)], PROMPT_2);

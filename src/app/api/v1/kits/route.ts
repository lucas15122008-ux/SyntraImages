import { after, NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api/http';
import { ApiInputError, createKitFromRequest, generatePositions, kitView, type KitRequest } from '@/lib/api/kits';

// A geração do kit continua depois da resposta (cada foto leva de 12 a 35 s).
export const maxDuration = 300;

/** Cria um kit e começa a gerar as fotos. Responde na hora; acompanhe em GET /api/v1/kits/{id}. */
export async function POST(req: Request) {
  return withApiKey(req, async ({ store, origin }) => {
    let body: KitRequest;
    let files: { foto?: File; referencia?: File } = {};
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await req.formData();
      const foto = form.get('foto');
      const referencia = form.get('referencia');
      body = JSON.parse(String(form.get('dados') ?? '{}'));
      files = { foto: foto instanceof File ? foto : undefined, referencia: referencia instanceof File && referencia.size ? referencia : undefined };
    } else {
      body = await req.json().catch(() => {
        throw new ApiInputError('O corpo precisa ser um JSON válido.');
      });
    }
    const { kitId, positions } = await createKitFromRequest(body, { store, files });
    after(() => generatePositions(store, kitId, positions));
    const kit = (await store.getKit(kitId))!;
    return NextResponse.json(await kitView(store, kit, origin), { status: 202 });
  });
}

/** Os kits mais recentes da conta da chave. */
export async function GET(req: Request) {
  return withApiKey(req, async ({ store, origin }) => {
    const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limite')) || 10));
    const kits = await store.listKits(limit);
    return NextResponse.json({
      kits: kits.map((k) => ({ id: k.id, produto: k.product_name, criado_em: k.created_at ?? null, link_no_app: `${origin}/kits/${k.id}` })),
    });
  });
}

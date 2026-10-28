import { after, NextResponse } from 'next/server';
import { apiError, withApiKey } from '@/lib/api/http';
import { generatePositions, kitView, positionsToGenerate } from '@/lib/api/kits';

export const maxDuration = 300;

/**
 * Gera de novo. Sem corpo: as fotos pendentes ou que falharam. Com {"posicoes": [2, 5]}:
 * refaz essas, mesmo as que já estão prontas.
 */
export async function POST(req: Request, { params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;
  return withApiKey(req, async ({ store, origin }) => {
    const kit = await store.getKit(kitId).catch(() => null);
    if (!kit) return apiError('Kit não encontrado.', 404);
    const body = (await req.json().catch(() => ({}))) as { posicoes?: unknown };
    const positions = await positionsToGenerate(store, kitId, body?.posicoes);
    if (positions.length) after(() => generatePositions(store, kitId, positions));
    const view = await kitView(store, kit, origin);
    return NextResponse.json({ gerando: positions, ...view, status: positions.length ? 'gerando' : view.status }, { status: 202 });
  });
}

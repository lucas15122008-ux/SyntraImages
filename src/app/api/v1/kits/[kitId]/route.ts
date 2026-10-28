import { NextResponse } from 'next/server';
import { apiError, withApiKey } from '@/lib/api/http';
import { kitView } from '@/lib/api/kits';

/** Situação do kit e links temporários (1 hora) das fotos prontas. */
export async function GET(req: Request, { params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;
  return withApiKey(req, async ({ store, origin }) => {
    const kit = await store.getKit(kitId).catch(() => null);
    if (!kit) return apiError('Kit não encontrado.', 404);
    return NextResponse.json(await kitView(store, kit, origin));
  });
}

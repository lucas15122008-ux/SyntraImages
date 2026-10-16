import { NextResponse } from 'next/server';
import { getKitStore } from '@/lib/kit/store';
import { isReadyForDownload } from '@/lib/kit/download';
import { getDownloadConfig, normalizeImage } from '@/lib/kit/normalize';
import { buildZip, slugName } from '@/lib/kit/zip';
import { getSupabaseServer } from '@/lib/supabase/server';

export const maxDuration = 120;

export async function GET(_req: Request, { params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;
  const sb = await getSupabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const store = await getKitStore();
  const kit = await store.getKit(kitId);
  if (!kit) return NextResponse.json({ error: 'Kit não encontrado.' }, { status: 404 });

  const { data: rows, error } = await sb.from('kit_photos').select('position, kind, type, status, storage_path').eq('kit_id', kitId).order('position');
  if (error || !rows?.length) return NextResponse.json({ error: 'Não foi possível ler as fotos do kit.' }, { status: 500 });
  if (rows.some((r) => !r.storage_path || !isReadyForDownload(r.status, true))) {
    return NextResponse.json({ error: 'Ainda há fotos sendo geradas ou com falha. Termine o kit antes de baixar.' }, { status: 409 });
  }

  const product = slugName(kit.product_name);
  const config = getDownloadConfig();
  const photos = await Promise.all(
    rows.map(async (r) => {
      const normalized = await normalizeImage(await store.getFile(r.kind === 'fixed' ? 'store' : 'generated', r.storage_path!), config);
      const name = r.kind === 'cover' ? `${product}-capa` : r.kind === 'fixed' ? `${product}-loja` : `${product}-${r.type ?? 'foto'}`;
      return { position: r.position as number, name, bytes: normalized.bytes, ext: normalized.ext };
    }),
  );

  const zip = await buildZip(photos);
  return new Response(new Blob([zip as BlobPart], { type: 'application/zip' }), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${product}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

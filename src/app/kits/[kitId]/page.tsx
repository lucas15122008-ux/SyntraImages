import { notFound } from 'next/navigation';
import { KitScreen } from '@/components/kit/KitScreen';
import type { ReviewPhoto } from '@/components/kit/PhotoCard';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function KitPage({ params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;
  await requireUser();
  const sb = await getSupabaseServer();

  const { data: kit } = await sb.from('kits').select('id, product_name, car_model, car_year, original_path').eq('id', kitId).maybeSingle();
  if (!kit) notFound();
  const { data: rows } = await sb.from('kit_photos').select('*').eq('kit_id', kitId).order('position');

  const sign = async (bucket: string, path: string | null) =>
    path ? ((await sb.storage.from(bucket).createSignedUrl(path, 3600)).data?.signedUrl ?? null) : null;

  const originalUrl = (await sign('originals', kit.original_path)) ?? '';
  const photos: ReviewPhoto[] = await Promise.all(
    (rows ?? []).map(async (r) => ({
      position: r.position,
      kind: r.kind,
      type: r.type,
      status: r.status,
      url: r.status === 'done' ? await sign(r.kind === 'fixed' ? 'store' : 'generated', r.storage_path) : null,
      warn: r.warn_missing_angle && !r.warn_dismissed,
      error: r.error,
      attempts: r.attempts,
    })),
  );

  const car = [kit.car_model, kit.car_year].filter(Boolean).join(' ');
  return (
    <>
      <h1>Revisar fotos</h1>
      <KitScreen kitId={kitId} title={car ? `${kit.product_name} · ${car}` : kit.product_name} originalUrl={originalUrl} photos={photos} />
    </>
  );
}

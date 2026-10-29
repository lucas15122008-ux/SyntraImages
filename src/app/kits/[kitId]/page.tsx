import { notFound } from 'next/navigation';
import { PublishForm } from '@/components/impact/PublishForm';
import { KitScreen } from '@/components/kit/KitScreen';
import { dayLabel } from '@/components/revenue/format';
import { KitSteps } from '@/components/layout/KitSteps';
import type { ReviewPhoto } from '@/components/kit/PhotoCard';
import { isReadyForDownload } from '@/lib/kit/download';
import { isStaleGeneration } from '@/lib/kit/limits';
import type { KitConfig } from '@/lib/kit/types';
import { switchesForKit } from '@/lib/ml/photo-switches';
import { brtDay } from '@/lib/ml/revenue';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

// Longa o bastante para a tela ficar aberta durante um kit inteiro sem as imagens expirarem.
const SIGNED_URL_SECONDS = 4 * 3600;

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Revisar fotos' };

export default async function KitPage({ params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;
  await requireUser();
  const sb = await getSupabaseServer();

  const { data: kit } = await sb.from('kits').select('id, product_name, car_model, car_year, original_path, config').eq('id', kitId).maybeSingle();
  if (!kit) notFound();
  const { data: rows } = await sb.from('kit_photos').select('*').eq('kit_id', kitId).order('position');

  const sign = async (bucket: string, path: string | null) =>
    path ? ((await sb.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS)).data?.signedUrl ?? null) : null;

  const originalUrl = (await sign('originals', kit.original_path)) ?? '';
  const photos: ReviewPhoto[] = await Promise.all(
    (rows ?? []).map(async (r) => ({
      position: r.position,
      kind: r.kind,
      type: r.type,
      customLabel: r.custom_label ?? null,
      status: r.status,
      url: isReadyForDownload(r.status, !!r.storage_path) ? await sign(r.kind === 'fixed' ? 'store' : 'generated', r.storage_path) : null,
      version: r.storage_path,
      stale: isStaleGeneration(r.status, r.generating_since),
      warn: r.warn_missing_angle && !r.warn_dismissed,
      error: r.error,
      attempts: r.attempts,
    })),
  );

  const allReady = photos.length > 0 && photos.every((p) => isReadyForDownload(p.status, !!p.url));
  const car = [kit.car_model, kit.car_year].filter(Boolean).join(' ');
  // O kit já passou pelo RLS acima, então é de quem está vendo.
  const published = allReady ? await switchesForKit(kitId).catch(() => []) : [];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Revisar fotos</h1>
          <p className="sub">Confira cada foto ao lado da original. Refaça só as que não servem e baixe o kit.</p>
        </div>
        <KitSteps current={allReady ? 3 : 2} />
      </div>
      <KitScreen
        kitId={kitId}
        title={car ? `${kit.product_name} · ${car}` : kit.product_name}
        info={{
          productName: kit.product_name,
          coverWithCar: !!(kit.config as KitConfig | null)?.coverWithCar,
          carModel: kit.car_model ?? '',
          carYear: kit.car_year ?? '',
        }}
        originalUrl={originalUrl}
        photos={photos}
      />
      {allReady && (
        <section className="panel kit-published">
          <div className="head">
            <h2>Publicou estas fotos no Mercado Livre?</h2>
          </div>
          <p className="sub">Registre o anúncio e o dia da troca. A tela Foto x venda compara as vendas antes e depois.</p>
          {published.length > 0 && (
            <ul>
              {published.map((p) => (
                <li key={p.id} className="status-ok">
                  {p.ml_item_id} desde {dayLabel(p.switched_on)}
                </li>
              ))}
            </ul>
          )}
          <PublishForm kitId={kitId} today={brtDay(new Date())} />
        </section>
      )}
    </>
  );
}

import Link from 'next/link';
import { KitEmptyState, KitGallery, type KitCardData } from '@/components/kit/KitGallery';
import { Icon } from '@/components/ui/Icon';
import { summarizeKit, type PhotoRow } from '@/lib/kit/summary';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await requireUser();
  const sb = await getSupabaseServer();
  const { data: kits } = await sb
    .from('kits')
    .select('id, product_name, car_model, car_year, original_path, created_at, kit_photos(position, kind, status, storage_path, warn_missing_angle, warn_dismissed)')
    .order('created_at', { ascending: false })
    .limit(30);

  const rows = (kits ?? []).map((k) => ({ ...k, summary: summarizeKit((k.kit_photos ?? []) as PhotoRow[]) }));

  // Miniatura: a capa gerada; enquanto não existe, a foto original do produto.
  const [covers, originals] = await Promise.all([
    signAll(sb, 'generated', rows.map((r) => r.summary.coverPath)),
    signAll(sb, 'originals', rows.map((r) => (r.summary.coverPath ? null : r.original_path))),
  ]);

  const cards: KitCardData[] = rows.map((r, i) => ({
    id: r.id,
    name: r.product_name,
    car: [r.car_model, r.car_year].filter(Boolean).join(' '),
    createdAt: r.created_at,
    thumbUrl: covers[i] ?? originals[i] ?? null,
    summary: r.summary,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Meus kits</h1>
          <p className="sub">Abra um kit para revisar, refazer fotos ou baixar.</p>
        </div>
        {cards.length > 0 && (
          <Link className="btn" href="/kits/novo">
            <Icon name="plus" /> Novo kit
          </Link>
        )}
      </div>
      {cards.length ? <KitGallery kits={cards} /> : <KitEmptyState />}
    </>
  );
}

type Sb = Awaited<ReturnType<typeof getSupabaseServer>>;

/** Assina várias imagens de um bucket numa chamada só; mantém a ordem e devolve null onde não há caminho. */
async function signAll(sb: Sb, bucket: string, paths: (string | null)[]): Promise<(string | null)[]> {
  const wanted = paths.filter((p): p is string => !!p);
  if (!wanted.length) return paths.map(() => null);
  const { data } = await sb.storage.from(bucket).createSignedUrls(wanted, 3600);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => (p ? (byPath.get(p) ?? null) : null));
}

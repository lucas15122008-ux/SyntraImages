import { NewKitScreen } from '@/components/kit/NewKitScreen';
import { listTemplates } from '@/lib/kit/templates';
import { getStoreAssets } from '@/lib/store/actions';
import { requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewKitPage() {
  await requireUser();
  const [templates, assets] = await Promise.all([listTemplates(), getStoreAssets()]);
  return (
    <>
      <h1>Montar o kit</h1>
      <p className="sub">Suba uma foto da peça, escolha o kit e gere as fotos.</p>
      <NewKitScreen templates={templates} storeReady={!!assets[0] && !!assets[1]} />
    </>
  );
}

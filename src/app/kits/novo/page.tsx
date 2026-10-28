import { KitSteps } from '@/components/layout/KitSteps';
import { NewKitScreen } from '@/components/kit/NewKitScreen';
import { listCustomTypes } from '@/lib/kit/custom-types';
import { listTemplates } from '@/lib/kit/templates';
import { getStoreAssets } from '@/lib/store/actions';
import { requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Montar o kit' };

export default async function NewKitPage() {
  await requireUser();
  const [templates, assets, savedCustom] = await Promise.all([listTemplates(), getStoreAssets(), listCustomTypes()]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Montar o kit</h1>
          <p className="sub">Suba uma foto da peça, ajuste o kit proposto e gere as fotos.</p>
        </div>
        <KitSteps current={1} />
      </div>
      <NewKitScreen templates={templates} storeReady={!!assets[0] && !!assets[1]} savedCustom={savedCustom} />
    </>
  );
}

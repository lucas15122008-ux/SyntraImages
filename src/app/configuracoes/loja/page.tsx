import { getStoreAssets } from '@/lib/store/actions';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { StoreAssetForm } from '@/components/store/StoreAssetForm';

export const dynamic = 'force-dynamic';

export default async function StoreSettingsPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const assets = await getStoreAssets();
  const urls = await Promise.all(
    assets.map(async (a) => (a ? ((await sb.storage.from('store').createSignedUrl(a.storage_path, 3600)).data?.signedUrl ?? null) : null)),
  );

  return (
    <main className="settings-page">
      <h1>Fotos da loja</h1>
      <p>
        As duas artes abaixo entram no fim de todo kit que tiver as fotos da loja ligadas, sem passar pela IA e sem custo de geração.
      </p>
      {isAdmin ? (
        <div className="store-assets">
          <StoreAssetForm slot={0} currentUrl={urls[0]} />
          <StoreAssetForm slot={1} currentUrl={urls[1]} />
        </div>
      ) : (
        <p role="note">Só o administrador pode trocar as artes da loja.</p>
      )}
    </main>
  );
}

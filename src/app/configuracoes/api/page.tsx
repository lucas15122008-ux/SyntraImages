import { headers } from 'next/headers';
import { ApiKeysPanel } from '@/components/api/ApiKeysPanel';
import { Icon } from '@/components/ui/Icon';
import { listApiKeys, type ApiKeyRow } from '@/lib/api/key-actions';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API e MCP' };

export default async function ApiSettingsPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  let keys: ApiKeyRow[] = [];
  let loadError: string | null = null;
  if (isAdmin) {
    try {
      keys = await listApiKeys();
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Não foi possível ler as chaves.';
    }
  }
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, '') || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;

  return (
    <main className="settings-page">
      <div className="page-head">
        <div>
          <h1>API e MCP</h1>
          <p className="sub">
            Chaves para outros programas, como o Claude, criarem kits de fotos sem abrir o app. Os kits criados com uma chave aparecem em Meus kits de
            quem criou a chave e contam no mesmo limite diário de gerações da equipe.
          </p>
        </div>
      </div>
      {!isAdmin ? (
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador cria chaves da API.
        </p>
      ) : loadError ? (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> {loadError}
        </p>
      ) : (
        <ApiKeysPanel keys={keys} origin={origin} />
      )}
    </main>
  );
}

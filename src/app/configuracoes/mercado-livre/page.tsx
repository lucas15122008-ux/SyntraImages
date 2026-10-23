import { Icon } from '@/components/ui/Icon';
import { disconnectMercadoLivre } from '@/lib/ml/actions';
import { getConnectionStatus } from '@/lib/ml/connection';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mercado Livre' };

const ERRORS: Record<string, string> = {
  admin: 'Só o administrador pode conectar a conta do Mercado Livre.',
  config: 'O app do Mercado Livre ainda não foi configurado no servidor (ML_CLIENT_ID e ML_CLIENT_SECRET).',
  negado: 'A autorização foi cancelada no Mercado Livre.',
  sessao: 'O login no Mercado Livre expirou ou veio de outra aba. Tente conectar de novo.',
  token: 'O Mercado Livre não liberou o acesso. Confira a URL de retorno do app no DevCenter e tente de novo.',
};

export default async function MercadoLivrePage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { erro, ok } = await searchParams;
  const connection = await getConnectionStatus();

  return (
    <main className="settings-page">
      <div className="page-head">
        <div>
          <h1>Mercado Livre</h1>
          <p className="sub">Conecte a conta da loja para o Syntra ler as métricas dos anúncios. O acesso fica guardado só no servidor.</p>
        </div>
      </div>

      {erro && ERRORS[erro] && (
        <p className="field-error" role="alert">
          {ERRORS[erro]}
        </p>
      )}
      {ok && connection && (
        <p className="status-ok" role="status">
          <Icon name="check" size={16} /> Conta conectada.
        </p>
      )}

      <div className="panel">
        <div className="head">
          <h2>{connection ? `Conectado como ${connection.nickname ?? `vendedor ${connection.mlUserId}`}` : 'Nenhuma conta conectada'}</h2>
        </div>
        {connection && (
          <p className="sub">Desde {new Date(connection.connectedAt).toLocaleDateString('pt-BR')}.</p>
        )}
        {isAdmin ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn" href="/api/ml/connect">
              {connection ? 'Reconectar' : 'Conectar Mercado Livre'}
              <Icon name="arrowRight" size={16} />
            </a>
            {connection && (
              <form action={disconnectMercadoLivre}>
                <button type="submit" className="btn soft">
                  Desconectar
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="alert" role="note">
            <Icon name="lock" size={16} /> Só o administrador pode conectar ou desconectar a conta.
          </p>
        )}
      </div>
    </main>
  );
}

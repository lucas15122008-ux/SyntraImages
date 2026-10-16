import { InviteForm } from '@/components/store/InviteForm';
import { Icon } from '@/components/ui/Icon';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipe' };

export default async function TeamPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  return (
    <main className="settings-page">
      <div className="page-head">
        <div>
          <h1>Equipe</h1>
          <p className="sub">Não existe cadastro aberto: cada pessoa entra por convite e recebe um e-mail para criar a senha.</p>
        </div>
      </div>
      {profile?.role === 'admin' ? (
        <div className="panel">
          <div className="head">
            <h2>Convidar uma pessoa</h2>
          </div>
          <InviteForm />
        </div>
      ) : (
        <p className="alert" role="note">
          <Icon name="lock" size={16} /> Só o administrador pode convidar pessoas.
        </p>
      )}
    </main>
  );
}

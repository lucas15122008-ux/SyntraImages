import { InviteForm } from '@/components/store/InviteForm';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();

  return (
    <main className="settings-page">
      <h1>Equipe</h1>
      {profile?.role === 'admin' ? (
        <div className="panel">
          <p>Não existe cadastro aberto: cada pessoa entra por convite. Ela recebe um e-mail para criar a senha.</p>
          <InviteForm />
        </div>
      ) : (
        <p role="note">Só o administrador pode convidar pessoas.</p>
      )}
    </main>
  );
}

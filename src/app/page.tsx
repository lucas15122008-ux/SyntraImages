import Link from 'next/link';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await requireUser();
  const sb = await getSupabaseServer();
  const { data: kits } = await sb.from('kits').select('id, product_name, created_at').order('created_at', { ascending: false }).limit(30);

  return (
    <>
      <h1>Meus kits</h1>
      <p className="sub">Os kits que você já montou. Abra um para revisar, refazer fotos ou baixar.</p>
      <div className="panel">
        <div className="head">
          <h2>Kits recentes</h2>
          <Link className="btn" href="/kits/novo">
            Novo kit
          </Link>
        </div>
        {kits?.length ? (
          <ul className="kit-list">
            {kits.map((k) => (
              <li key={k.id}>
                <Link href={`/kits/${k.id}`}>{k.product_name}</Link>
                <span className="note">{new Date(k.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">Você ainda não montou nenhum kit.</p>
        )}
      </div>
    </>
  );
}

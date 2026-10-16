import { NextResponse } from 'next/server';
import { generatePhoto } from '@/lib/kit/generate';
import { getKitStore } from '@/lib/kit/store';
import { getSupabaseServer } from '@/lib/supabase/server';

// Uma geração leva 12–35 s; com até 2 repetições automáticas pode passar de 1 minuto.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ kitId: string; position: string }> }) {
  const { kitId, position: rawPosition } = await params;
  const position = Number(rawPosition);
  if (!Number.isInteger(position) || position < 1) {
    return NextResponse.json({ error: 'Posição inválida.' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  try {
    const store = await getKitStore();
    await generatePhoto(kitId, position, { store });
    const photo = await store.getPhoto(kitId, position);
    return NextResponse.json({ status: photo?.status ?? 'failed', error: photo?.error ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro inesperado.';
    return NextResponse.json({ error: message }, { status: /limite diário/i.test(message) ? 429 : 400 });
  }
}

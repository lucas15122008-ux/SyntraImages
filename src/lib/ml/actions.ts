'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/supabase/server';
import { deleteConnection } from './connection';
import { SETTINGS_PATH } from './cookie';

/** Apaga os tokens guardados. Para revogar de vez, o vendedor também pode remover o app no ML. */
export async function disconnectMercadoLivre(): Promise<void> {
  await requireAdmin();
  await deleteConnection();
  revalidatePath(SETTINGS_PATH);
}

import { createBrowserClient } from '@supabase/ssr';

/** Cliente do Supabase para o navegador (só a chave pública anon). */
export function getSupabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

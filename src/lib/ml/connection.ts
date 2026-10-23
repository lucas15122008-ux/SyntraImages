import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { openToken, sealToken } from './crypto';
import { ML_API, refreshTokens, type MlTokens } from './oauth';

/** Renova o token quando faltar menos que isso para vencer. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Quanto tempo um servidor pode segurar a renovação antes de outro reassumir. */
const REFRESH_LOCK_MS = 30 * 1000;

export type ConnectionRow = {
  ml_user_id: number;
  nickname: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  connected_at: string;
};

export type ConnectionStore = {
  read(): Promise<ConnectionRow | null>;
  /** Tenta pegar a vez de renovar; false se outro servidor já está renovando. */
  claimRefresh(until: Date, now: Date): Promise<boolean>;
  saveRefreshed(tokens: MlTokens): Promise<void>;
  releaseRefresh(): Promise<void>;
};

export class MlNotConnectedError extends Error {
  constructor() {
    super('A conta do Mercado Livre não está conectada. Peça ao administrador para conectar em Configurações.');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Devolve um access token válido, renovando quando estiver perto de vencer. */
export async function getAccessTokenWith(
  store: ConnectionStore,
  refresh: (refreshToken: string) => Promise<MlTokens> = (t) => refreshTokens(t),
  opts: { now?: () => Date; wait?: (ms: number) => Promise<void>; attempts?: number } = {},
): Promise<string> {
  const now = opts.now ?? (() => new Date());
  const wait = opts.wait ?? sleep;
  const attempts = opts.attempts ?? 20;

  for (let i = 0; i < attempts; i++) {
    const row = await store.read();
    if (!row) throw new MlNotConnectedError();
    if (new Date(row.expires_at).getTime() - now().getTime() > REFRESH_MARGIN_MS) return openToken(row.access_token_enc);

    const t = now();
    if (await store.claimRefresh(new Date(t.getTime() + REFRESH_LOCK_MS), t)) {
      try {
        const tokens = await refresh(openToken(row.refresh_token_enc));
        await store.saveRefreshed(tokens);
        return tokens.accessToken;
      } catch (e) {
        await store.releaseRefresh();
        throw e;
      }
    }
    await wait(500);
  }
  throw new Error('Não foi possível renovar o acesso ao Mercado Livre agora. Tente de novo em instantes.');
}

/** Implementação no Supabase (chave de serviço: a tabela não tem política para o navegador). */
export function supabaseConnectionStore(): ConnectionStore {
  const sb = getSupabaseAdmin();
  return {
    async read() {
      const { data, error } = await sb
        .from('ml_connection')
        .select('ml_user_id, nickname, access_token_enc, refresh_token_enc, expires_at, connected_at')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw new Error(`Não foi possível ler a conexão com o Mercado Livre: ${error.message}`);
      return data;
    },
    async claimRefresh(until, now) {
      const { data, error } = await sb
        .from('ml_connection')
        .update({ refreshing_until: until.toISOString() })
        .eq('id', 1)
        .or(`refreshing_until.is.null,refreshing_until.lt.${now.toISOString()}`)
        .select('id');
      if (error) throw new Error(`Não foi possível renovar o acesso ao Mercado Livre: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async saveRefreshed(tokens) {
      const { error } = await sb
        .from('ml_connection')
        .update({
          access_token_enc: sealToken(tokens.accessToken),
          refresh_token_enc: sealToken(tokens.refreshToken),
          expires_at: tokens.expiresAt.toISOString(),
          scope: tokens.scope,
          refreshing_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      if (error) throw new Error(`Não foi possível guardar o acesso renovado: ${error.message}`);
    },
    async releaseRefresh() {
      await sb.from('ml_connection').update({ refreshing_until: null }).eq('id', 1);
    },
  };
}

/** Grava (ou troca) a conta conectada depois do login no Mercado Livre. */
export async function saveConnection(tokens: MlTokens, nickname: string | null, connectedBy: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('ml_connection')
    .upsert({
      id: 1,
      ml_user_id: tokens.userId,
      nickname,
      access_token_enc: sealToken(tokens.accessToken),
      refresh_token_enc: sealToken(tokens.refreshToken),
      expires_at: tokens.expiresAt.toISOString(),
      scope: tokens.scope,
      refreshing_until: null,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Não foi possível salvar a conexão com o Mercado Livre: ${error.message}`);
}

export async function deleteConnection(): Promise<void> {
  const { error } = await getSupabaseAdmin().from('ml_connection').delete().eq('id', 1);
  if (error) throw new Error(`Não foi possível desconectar: ${error.message}`);
}

/** O que a tela de configurações pode mostrar (nunca os tokens). */
export async function getConnectionStatus(): Promise<{ nickname: string | null; mlUserId: number; connectedAt: string } | null> {
  const row = await supabaseConnectionStore().read();
  return row ? { nickname: row.nickname, mlUserId: row.ml_user_id, connectedAt: row.connected_at } : null;
}

/** GET na API do ML com o token da loja. Base para as métricas. */
export async function mlGet<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const token = await getAccessTokenWith(supabaseConnectionStore());
  const res = await fetchImpl(`${ML_API}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Mercado Livre respondeu ${res.status} em ${path.split('?')[0]}`);
  return (await res.json()) as T;
}

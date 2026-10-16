import 'server-only';
import { getSupabaseAdmin, getSupabaseServer, requireUser } from '@/lib/supabase/server';
import type { KitConfig, PhotoType } from './types';

export type KitRow = {
  id: string;
  owner: string;
  product_name: string;
  car_model: string | null;
  car_year: string | null;
  config: KitConfig;
  original_path: string;
  extra_reference_path: string | null;
};

export type PhotoRow = {
  id: string;
  kit_id: string;
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  type: PhotoType | null;
  status: 'pending' | 'generating' | 'done' | 'failed';
  /** Bucket `generated` para cover/generated; bucket `store` para fixed. */
  storage_path: string | null;
  warn_missing_angle: boolean;
  warn_dismissed: boolean;
  attempts: number;
  error: string | null;
  generating_since: Date | null;
};

export type StoreAsset = { slot: 0 | 1; storage_path: string };
export type Bucket = 'originals' | 'generated' | 'store';

/** Tudo o que a geração precisa do banco e do storage; o Supabase é só uma implementação. */
export interface KitStore {
  currentUserId(): Promise<string>;
  getStoreAssets(): Promise<[StoreAsset | null, StoreAsset | null]>;
  putFile(bucket: Bucket, path: string, bytes: Uint8Array, mime: string): Promise<void>;
  getFile(bucket: Bucket, path: string): Promise<Uint8Array>;
  removeFile(bucket: Bucket, path: string): Promise<void>;
  insertKit(row: Omit<KitRow, 'owner'>): Promise<void>;
  insertPhotos(rows: Array<Omit<PhotoRow, 'id'>>): Promise<void>;
  deleteKit(kitId: string): Promise<void>;
  getKit(kitId: string): Promise<KitRow | null>;
  getPhoto(kitId: string, position: number): Promise<PhotoRow | null>;
  /**
   * Passa a foto para `generating` de forma atômica e soma uma tentativa.
   * Devolve null se outra geração já está em andamento (a menos que esteja travada
   * desde antes de `staleBefore`).
   */
  claimPhoto(kitId: string, position: number, staleBefore: Date): Promise<PhotoRow | null>;
  countGenerationsSince(since: Date): Promise<number>;
  logGeneration(kitId: string, position: number): Promise<void>;
  updatePhoto(
    id: string,
    patch: Partial<Pick<PhotoRow, 'status' | 'storage_path' | 'error' | 'generating_since'>>,
  ): Promise<void>;
}

type RawPhoto = Omit<PhotoRow, 'generating_since'> & { generating_since: string | null };
const toPhoto = (r: RawPhoto): PhotoRow => ({ ...r, generating_since: r.generating_since ? new Date(r.generating_since) : null });

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'erro desconhecido'}`);
}

/** Implementação com o Supabase: banco e storage sob o RLS do usuário; o log de gerações usa a chave de serviço. */
export async function getKitStore(): Promise<KitStore> {
  const user = await requireUser();
  const sb = await getSupabaseServer();
  const admin = getSupabaseAdmin();

  const store: KitStore = {
    currentUserId: async () => user.id,

    async getStoreAssets() {
      const { data, error } = await sb.from('store_assets').select('slot, storage_path');
      if (error) fail('Falha ao ler as artes da loja', error);
      const find = (slot: 0 | 1) => (data ?? []).find((a) => a.slot === slot) ?? null;
      return [find(0), find(1)] as [StoreAsset | null, StoreAsset | null];
    },

    async putFile(bucket, path, bytes, mime) {
      const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
      if (error) fail('Falha ao gravar o arquivo', error);
    },

    async getFile(bucket, path) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) fail('Falha ao ler o arquivo', error);
      return new Uint8Array(await data.arrayBuffer());
    },

    async removeFile(bucket, path) {
      const { error } = await sb.storage.from(bucket).remove([path]);
      if (error) fail('Falha ao apagar o arquivo', error);
    },

    async insertKit(row) {
      const { error } = await sb.from('kits').insert(row);
      if (error) fail('Falha ao criar o kit', error);
    },

    async insertPhotos(rows) {
      const { error } = await sb.from('kit_photos').insert(rows.map((r) => ({ ...r, generating_since: null })));
      if (error) fail('Falha ao criar as fotos do kit', error);
    },

    async deleteKit(kitId) {
      const { error } = await sb.from('kits').delete().eq('id', kitId);
      if (error) fail('Falha ao apagar o kit', error);
    },

    async getKit(kitId) {
      const { data, error } = await sb.from('kits').select('*').eq('id', kitId).maybeSingle();
      if (error) fail('Falha ao ler o kit', error);
      return (data as KitRow | null) ?? null;
    },

    async getPhoto(kitId, position) {
      const { data, error } = await sb.from('kit_photos').select('*').eq('kit_id', kitId).eq('position', position).maybeSingle();
      if (error) fail('Falha ao ler a foto', error);
      return data ? toPhoto(data as RawPhoto) : null;
    },

    async claimPhoto(kitId, position, staleBefore) {
      const current = await store.getPhoto(kitId, position);
      if (!current) return null;
      // A condição no UPDATE é o que garante uma geração por vez, mesmo com duas requisições simultâneas.
      const { data, error } = await sb
        .from('kit_photos')
        .update({ status: 'generating', attempts: current.attempts + 1, error: null, generating_since: new Date().toISOString() })
        .eq('kit_id', kitId)
        .eq('position', position)
        .or(`status.in.(pending,failed,done),and(status.eq.generating,generating_since.lt.${staleBefore.toISOString()})`)
        .select()
        .maybeSingle();
      if (error) fail('Falha ao reservar a foto para gerar', error);
      return data ? toPhoto(data as RawPhoto) : null;
    },

    async countGenerationsSince(since) {
      const { count, error } = await admin
        .from('generation_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since.toISOString());
      if (error) fail('Falha ao contar as gerações do dia', error);
      return count ?? 0;
    },

    async logGeneration(kitId, position) {
      const { error } = await admin.from('generation_log').insert({ user_id: user.id, kit_id: kitId, position });
      if (error) fail('Falha ao registrar a geração', error);
    },

    async updatePhoto(id, patch) {
      const { generating_since, ...rest } = patch;
      const { error } = await sb
        .from('kit_photos')
        .update({ ...rest, ...(generating_since !== undefined ? { generating_since: generating_since?.toISOString() ?? null } : {}) })
        .eq('id', id);
      if (error) fail('Falha ao atualizar a foto', error);
    },
  };
  return store;
}

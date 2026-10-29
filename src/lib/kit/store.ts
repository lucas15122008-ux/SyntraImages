import 'server-only';
import { getStoreAssets } from '@/lib/store/actions';
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
  created_at?: string;
};

export type PhotoRow = {
  id: string;
  kit_id: string;
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  type: PhotoType | null;
  /** Só nas fotos `custom` (colunas da migração 0007). */
  custom_label?: string | null;
  custom_prompt?: string | null;
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
  updateKit(kitId: string, patch: Partial<Pick<KitRow, 'product_name' | 'car_model' | 'car_year' | 'config'>>): Promise<void>;
  getPhoto(kitId: string, position: number): Promise<PhotoRow | null>;
  /** Fotos do kit em ordem de posição. */
  listPhotos(kitId: string): Promise<PhotoRow[]>;
  /** Kits mais recentes da conta. */
  listKits(limit: number): Promise<KitRow[]>;
  /** Link temporário para ver um arquivo privado. */
  signedUrl(bucket: Bucket, path: string, seconds: number): Promise<string>;
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

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** Implementação com o Supabase: banco e storage sob o RLS do usuário; o log de gerações usa a chave de serviço. */
export async function getKitStore(): Promise<KitStore> {
  const user = await requireUser();
  return supabaseKitStore({ userId: user.id, sb: (await getSupabaseServer()) as unknown as Supabase, getStoreAssets });
}

/**
 * Para a API (chave de acesso, sem sessão): usa a chave de serviço, então o RLS não vale e
 * o filtro pelo dono é feito aqui. Kits de outras contas aparecem como "não encontrado".
 */
export function getKitStoreForUser(userId: string): KitStore {
  const admin = getSupabaseAdmin();
  return supabaseKitStore({
    userId,
    sb: admin,
    ownerScope: userId,
    async getStoreAssets() {
      const { data, error } = await admin.from('store_assets').select('slot, storage_path');
      if (error) throw new Error('Não foi possível ler as artes da loja.');
      const find = (slot: 0 | 1) => ((data ?? []) as StoreAsset[]).find((a) => a.slot === slot) ?? null;
      return [find(0), find(1)];
    },
  });
}

function supabaseKitStore(opts: {
  userId: string;
  sb: Supabase;
  /** Só com a chave de serviço: grava o dono e filtra kits e fotos por ele. */
  ownerScope?: string;
  getStoreAssets: KitStore['getStoreAssets'];
}): KitStore {
  const { userId, sb, ownerScope } = opts;
  const admin = getSupabaseAdmin();

  const store: KitStore = {
    currentUserId: async () => userId,

    getStoreAssets: opts.getStoreAssets,

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
      const values: Omit<KitRow, 'owner'> & { owner?: string } = ownerScope ? { ...row, owner: ownerScope } : row;
      const { error } = await sb.from('kits').insert(values);
      if (error) fail('Falha ao criar o kit', error);
    },

    async insertPhotos(rows) {
      const { error } = await sb.from('kit_photos').insert(rows.map((r) => ({ ...r, generating_since: null })));
      if (error) fail('Falha ao criar as fotos do kit', error);
    },

    async deleteKit(kitId) {
      let q = sb.from('kits').delete().eq('id', kitId);
      if (ownerScope) q = q.eq('owner', ownerScope);
      const { error } = await q;
      if (error) fail('Falha ao apagar o kit', error);
    },

    async getKit(kitId) {
      let q = sb.from('kits').select('*').eq('id', kitId);
      if (ownerScope) q = q.eq('owner', ownerScope);
      const { data, error } = await q.maybeSingle();
      if (error) fail('Falha ao ler o kit', error);
      return (data as KitRow | null) ?? null;
    },

    async updateKit(kitId, patch) {
      let q = sb.from('kits').update(patch).eq('id', kitId);
      if (ownerScope) q = q.eq('owner', ownerScope);
      const { error } = await q;
      if (error) fail('Falha ao salvar o kit', error);
    },

    async getPhoto(kitId, position) {
      if (ownerScope && !(await store.getKit(kitId))) return null;
      const { data, error } = await sb.from('kit_photos').select('*').eq('kit_id', kitId).eq('position', position).maybeSingle();
      if (error) fail('Falha ao ler a foto', error);
      return data ? toPhoto(data as RawPhoto) : null;
    },

    async listPhotos(kitId) {
      if (ownerScope && !(await store.getKit(kitId))) return [];
      const { data, error } = await sb.from('kit_photos').select('*').eq('kit_id', kitId).order('position');
      if (error) fail('Falha ao ler as fotos do kit', error);
      return ((data ?? []) as RawPhoto[]).map(toPhoto);
    },

    async listKits(limit) {
      let q = sb.from('kits').select('*');
      if (ownerScope) q = q.eq('owner', ownerScope);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
      if (error) fail('Falha ao ler os kits', error);
      return (data ?? []) as KitRow[];
    },

    async signedUrl(bucket, path, seconds) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds);
      if (error || !data) fail('Falha ao criar o link da foto', error);
      return data.signedUrl;
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
      const { error } = await admin.from('generation_log').insert({ user_id: userId, kit_id: kitId, position });
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

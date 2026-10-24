import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { mlGet } from './connection';
import { impactWindows, salesInWindow, side, verdict, type DayRange, type Impact } from './photo-impact';
import { fetchOrders, type SearchPage } from './revenue';

export type PhotoSwitch = { id: string; ml_item_id: string; switched_on: string; kit_id: string | null; created_at: string };

const COLUMNS = 'id, ml_item_id, switched_on, kit_id, created_at';

export async function listSwitches(): Promise<PhotoSwitch[]> {
  const { data, error } = await getSupabaseAdmin().from('photo_switches').select(COLUMNS).order('switched_on', { ascending: false });
  if (error) throw new Error(`Não foi possível ler os anúncios com fotos novas: ${error.message}`);
  return data;
}

export async function switchesForKit(kitId: string): Promise<PhotoSwitch[]> {
  const { data, error } = await getSupabaseAdmin().from('photo_switches').select(COLUMNS).eq('kit_id', kitId).order('switched_on', { ascending: false });
  if (error) throw new Error(`Não foi possível ler os anúncios deste kit: ${error.message}`);
  return data;
}

export async function insertSwitch(row: { ml_item_id: string; switched_on: string; kit_id: string | null; created_by: string }): Promise<'ok' | 'duplicate'> {
  const { error } = await getSupabaseAdmin().from('photo_switches').insert(row);
  if (error?.code === '23505') return 'duplicate';
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
  return 'ok';
}

export async function deleteSwitch(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('photo_switches').delete().eq('id', id);
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);
}

export type ItemInfo = { id: string; title: string; thumbnail: string | null; permalink: string | null; sellerId: number };

type ItemsResponse = { code: number; body: { id: string; title: string; thumbnail?: string; permalink?: string; seller_id: number } }[];

/** Título e miniatura dos anúncios, 20 por chamada (o máximo do ML). */
export async function fetchItems(ids: string[]): Promise<Map<string, ItemInfo>> {
  const out = new Map<string, ItemInfo>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20).join(',');
    const res = await mlGet<ItemsResponse>(`/items?ids=${chunk}&attributes=id,title,thumbnail,permalink,seller_id`);
    for (const r of res) {
      if (r.code !== 200) continue;
      const b = r.body;
      out.set(b.id, { id: b.id, title: b.title, thumbnail: b.thumbnail?.replace(/^http:/, 'https:') ?? null, permalink: b.permalink ?? null, sellerId: b.seller_id });
    }
  }
  return out;
}

async function visits(itemId: string, range: DayRange): Promise<number> {
  const res = await mlGet<{ total_visits: number }[]>(`/items/visits?ids=${itemId}&date_from=${range.from}&date_to=${range.to}`);
  return res[0]?.total_visits ?? 0;
}

const brtMidnight = (day: string) => new Date(`${day}T00:00:00.000-03:00`);

/** Visitas e vendas do anúncio nas janelas antes e depois da troca. */
export async function loadImpact(sellerId: number, s: PhotoSwitch, today: string): Promise<Impact> {
  const w = impactWindows(s.switched_on, today);
  if (w.days === 0) {
    const empty = side({ sales: 0, units: 0, gross: 0 }, 0);
    return { days: 0, before: empty, after: empty, verdict: 'waiting' };
  }
  const [orders, vBefore, vAfter] = await Promise.all([
    fetchOrders(sellerId, { from: brtMidnight(w.before.from), to: brtMidnight(w.after.to) }, (p) => mlGet<SearchPage>(p), 2, s.ml_item_id),
    visits(s.ml_item_id, w.before),
    visits(s.ml_item_id, w.after),
  ]);
  const before = side(salesInWindow(orders, s.ml_item_id, w.before), vBefore);
  const after = side(salesInWindow(orders, s.ml_item_id, w.after), vAfter);
  return { days: w.days, before, after, verdict: verdict(before, after, w.days) };
}

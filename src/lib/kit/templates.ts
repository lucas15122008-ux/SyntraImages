'use server';

import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { validateConfig } from './plan';
import type { KitConfig } from './types';

export type KitTemplate = { id: string; name: string; config: KitConfig };

/** Modelos não guardam o carro: modelo e ano mudam a cada produto. */
function withoutCar(config: KitConfig): KitConfig {
  const { car: _car, ...rest } = config;
  return rest;
}

export async function saveTemplate(name: string, config: KitConfig): Promise<string> {
  await requireUser();
  const clean = name.trim();
  if (!clean) throw new Error('Dê um nome ao modelo de kit.');
  // O carro não faz parte do modelo, então a validação usa um carro de mentira.
  const errors = validateConfig({ ...config, car: config.coverWithCar ? { model: '-', year: '-' } : undefined });
  if (errors.length) throw new Error(errors.join(' '));

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('kit_templates')
    .insert({ name: clean, config: withoutCar(config) })
    .select('id')
    .single();
  if (error || !data) throw new Error('Não foi possível salvar o modelo de kit.');
  return data.id;
}

export async function listTemplates(): Promise<KitTemplate[]> {
  await requireUser();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('kit_templates').select('id, name, config').order('name');
  if (error) throw new Error('Não foi possível carregar os modelos de kit.');
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, config: withoutCar(t.config as KitConfig) }));
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireUser();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('kit_templates').delete().eq('id', id).select('id');
  if (error) throw new Error('Não foi possível apagar o modelo de kit.');
  // O RLS só deixa apagar o que é seu (ou tudo, se for admin): 0 linhas = sem permissão.
  if (!data?.length) throw new Error('Você não pode apagar este modelo de kit.');
}

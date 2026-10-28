'use server';

import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { CUSTOM_LABEL_MAX, CUSTOM_PROMPT_MAX } from './plan';

export type SavedCustomType = { id: string; name: string; prompt: string };

export async function saveCustomType(name: string, prompt: string): Promise<SavedCustomType> {
  await requireUser();
  const cleanName = name.trim();
  const cleanPrompt = prompt.trim();
  if (!cleanName) throw new Error('Dê um nome à foto personalizada.');
  if (!cleanPrompt) throw new Error('Descreva a foto personalizada antes de salvar.');
  if (cleanName.length > CUSTOM_LABEL_MAX) throw new Error(`O nome pode ter no máximo ${CUSTOM_LABEL_MAX} caracteres.`);
  if (cleanPrompt.length > CUSTOM_PROMPT_MAX) throw new Error(`A descrição pode ter no máximo ${CUSTOM_PROMPT_MAX} caracteres.`);

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('custom_photo_types')
    .insert({ name: cleanName, prompt: cleanPrompt })
    .select('id, name, prompt')
    .single();
  if (error || !data) throw new Error('Não foi possível salvar a foto personalizada.');
  return data;
}

/** Lista os tipos salvos. Sem a migração 0007 a tabela não existe: devolve vazio em vez de quebrar a tela. */
export async function listCustomTypes(): Promise<SavedCustomType[]> {
  await requireUser();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('custom_photo_types').select('id, name, prompt').order('name');
  if (error) return [];
  return data ?? [];
}

export async function deleteCustomType(id: string): Promise<void> {
  await requireUser();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('custom_photo_types').delete().eq('id', id).select('id');
  if (error) throw new Error('Não foi possível apagar a foto personalizada.');
  // O RLS só deixa apagar o que é seu (ou tudo, se for admin): 0 linhas = sem permissão.
  if (!data?.length) throw new Error('Você não pode apagar esta foto personalizada.');
}

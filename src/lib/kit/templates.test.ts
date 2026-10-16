import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { KitConfig } from './types';

type Row = { id: string; name: string; config: KitConfig; created_by: string };
let rows: Row[];
let me: string;
let admin: boolean;

// Cliente falso que reproduz o RLS: apagar linha alheia afeta 0 linhas.
const fakeClient = () => ({
  from: (table: string) => {
    expect(table).toBe('kit_templates');
    return {
      insert: (v: { name: string; config: KitConfig }) => ({
        select: () => ({
          single: async () => {
            const row = { id: `t${rows.length + 1}`, created_by: me, ...v };
            rows.push(row);
            return { data: { id: row.id }, error: null };
          },
        }),
      }),
      select: () => ({
        order: async () => ({ data: rows.map(({ id, name, config }) => ({ id, name, config })), error: null }),
      }),
      delete: () => ({
        eq: (_col: string, id: string) => ({
          select: async () => {
            const hit = rows.filter((r) => r.id === id && (r.created_by === me || admin));
            rows = rows.filter((r) => !hit.includes(r));
            return { data: hit.map((r) => ({ id: r.id })), error: null };
          },
        }),
      }),
    };
  },
});

vi.mock('@/lib/supabase/server', () => ({
  requireUser: async () => ({ id: me }),
  getSupabaseServer: async () => fakeClient(),
}));

import { deleteTemplate, listTemplates, saveTemplate } from './templates';

const config = (over: Partial<KitConfig> = {}): KitConfig => ({
  total: 10,
  coverWithCar: true,
  car: { model: 'Gol', year: '2012' },
  useExtraReference: false,
  includeStore: true,
  types: ['white_front', 'use_hand'],
  ...over,
});

beforeEach(() => {
  rows = [];
  me = 'alice';
  admin = false;
});

describe('modelos de kit', () => {
  test('salvar e listar devolve a configuração sem os dados do carro', async () => {
    const id = await saveTemplate('Padrão JR', config());
    expect(id).toBe('t1');
    expect(rows[0].config.car).toBeUndefined();
    const list = await listTemplates();
    expect(list).toEqual([{ id: 't1', name: 'Padrão JR', config: { ...config(), car: undefined } }]);
    expect(list[0].config).not.toHaveProperty('car');
  });

  test('modelo com capa com carro é aceito mesmo sem carro preenchido', async () => {
    await expect(saveTemplate('Capa com carro', config({ car: undefined }))).resolves.toBeTruthy();
  });

  test('nome vazio ou só espaços é recusado', async () => {
    await expect(saveTemplate('   ', config())).rejects.toThrow(/nome/i);
    expect(rows).toHaveLength(0);
  });

  test('configuração inválida é recusada', async () => {
    await expect(saveTemplate('Ruim', config({ total: 99 }))).rejects.toThrow(/no máximo 16/);
    expect(rows).toHaveLength(0);
  });

  test('só o criador apaga; o admin também', async () => {
    await saveTemplate('Meu', config());
    me = 'bob';
    await expect(deleteTemplate('t1')).rejects.toThrow(/não pode apagar/i);
    expect(rows).toHaveLength(1);
    admin = true;
    await expect(deleteTemplate('t1')).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  test('o criador apaga o próprio modelo', async () => {
    await saveTemplate('Meu', config());
    await expect(deleteTemplate('t1')).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });
});

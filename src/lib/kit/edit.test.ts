import { describe, expect, test } from 'vitest';
import { editKit, type EditKitInput } from './edit';
import { createKit } from './generate';
import { fakeStore, file, jpegBytes } from './testing';
import type { KitConfig } from './types';

const config = (over: Partial<KitConfig> = {}): KitConfig => ({
  total: 4,
  coverWithCar: true,
  car: { model: 'Gol', year: '2012' },
  useExtraReference: false,
  includeStore: false,
  types: ['white_front', 'white_back'],
  ...over,
});

async function kit(over: Partial<KitConfig> = {}) {
  const f = fakeStore();
  const { kitId } = await createKit({ productName: 'Bomba de óleo', config: config(over), original: file(jpegBytes(), 'image/jpeg') }, { store: f.store });
  return { f, kitId };
}

const edit = (over: Partial<EditKitInput> = {}): EditKitInput => ({
  productName: 'Bomba de óleo',
  coverWithCar: true,
  car: { model: 'Gol', year: '2012' },
  ...over,
});

describe('editKit', () => {
  test('troca só o nome: salva e a capa continua valendo', async () => {
    const { f, kitId } = await kit();
    const res = await editKit(kitId, edit({ productName: '  Bomba de óleo Gol G5  ' }), { store: f.store });
    expect(res).toEqual({ coverChanged: false });
    expect(f.kits.get(kitId)).toMatchObject({ product_name: 'Bomba de óleo Gol G5', car_model: 'Gol', car_year: '2012' });
  });

  test('troca o carro: salva no kit e na configuração e avisa que a capa mudou', async () => {
    const { f, kitId } = await kit();
    const res = await editKit(kitId, edit({ car: { model: ' Voyage ', year: '2015' } }), { store: f.store });
    expect(res.coverChanged).toBe(true);
    const saved = f.kits.get(kitId)!;
    expect(saved).toMatchObject({ car_model: 'Voyage', car_year: '2015' });
    expect(saved.config).toMatchObject({ coverWithCar: true, car: { model: 'Voyage', year: '2015' }, types: ['white_front', 'white_back'] });
  });

  test('tira o carro da capa: limpa os campos do carro', async () => {
    const { f, kitId } = await kit();
    const res = await editKit(kitId, edit({ coverWithCar: false }), { store: f.store });
    expect(res.coverChanged).toBe(true);
    const saved = f.kits.get(kitId)!;
    expect(saved).toMatchObject({ car_model: null, car_year: null });
    expect(saved.config.coverWithCar).toBe(false);
    expect(saved.config.car).toBeUndefined();
  });

  test('põe carro numa capa comum', async () => {
    const { f, kitId } = await kit({ coverWithCar: false, car: undefined });
    const res = await editKit(kitId, edit({ car: { model: 'Onix', year: '2020' } }), { store: f.store });
    expect(res.coverChanged).toBe(true);
    expect(f.kits.get(kitId)).toMatchObject({ car_model: 'Onix', car_year: '2020' });
  });

  test.each([
    [edit({ productName: '   ' }), 'Informe o nome do produto.'],
    [edit({ productName: 'x'.repeat(121) }), 'no máximo 120'],
    [edit({ car: { model: '', year: '2012' } }), 'modelo do carro'],
    [edit({ car: { model: 'Gol', year: ' ' } }), 'ano do carro'],
  ])('recusa dados inválidos sem gravar nada (%#)', async (input, message) => {
    const { f, kitId } = await kit();
    await expect(editKit(kitId, input, { store: f.store })).rejects.toThrow(message);
    expect(f.writes).not.toContain('updateKit');
  });

  test('kit que não existe (ou de outra conta) dá erro', async () => {
    const f = fakeStore();
    await expect(editKit('nao-existe', edit(), { store: f.store })).rejects.toThrow('Kit não encontrado.');
  });
});

import 'server-only';
import { getKitStore, type KitStore } from './store';

export const PRODUCT_NAME_MAX = 120;

export type EditKitInput = {
  productName: string;
  coverWithCar: boolean;
  car: { model: string; year: string };
};

/**
 * Salva nome do produto e carro da capa de um kit pronto. As fotos já geradas não mudam;
 * os dados novos valem nas próximas gerações. `coverChanged` diz se a capa ficou desatualizada
 * (o carro entrou, saiu ou mudou), para a tela oferecer refazê-la.
 */
export async function editKit(kitId: string, input: EditKitInput, deps: { store?: KitStore } = {}): Promise<{ coverChanged: boolean }> {
  const store = deps.store ?? (await getKitStore());

  const productName = input.productName.trim();
  if (!productName) throw new Error('Informe o nome do produto.');
  if (productName.length > PRODUCT_NAME_MAX) throw new Error(`O nome do produto pode ter no máximo ${PRODUCT_NAME_MAX} caracteres.`);
  const model = input.car.model.trim();
  const year = input.car.year.trim();
  if (input.coverWithCar) {
    if (!model) throw new Error('Informe o modelo do carro para a capa com carro.');
    if (!year) throw new Error('Informe o ano do carro para a capa com carro.');
  }

  const kit = await store.getKit(kitId);
  if (!kit) throw new Error('Kit não encontrado.');

  const car = input.coverWithCar ? { model, year } : null;
  const before = kit.config.coverWithCar && kit.car_model && kit.car_year ? `${kit.car_model}|${kit.car_year}` : '';
  const after = car ? `${car.model}|${car.year}` : '';

  const config = { ...kit.config, coverWithCar: input.coverWithCar };
  if (car) config.car = car;
  else delete config.car;

  await store.updateKit(kitId, { product_name: productName, car_model: car?.model ?? null, car_year: car?.year ?? null, config });
  return { coverChanged: before !== after };
}

export type PhotoType =
  | 'white_front'
  | 'white_side'
  | 'white_detail'
  | 'white_back'
  | 'white_on_box'
  | 'use_hand'
  | 'use_installed'
  /** Cena escrita pela equipe (texto em `KitConfig.custom`). */
  | 'custom';

/** Foto personalizada: um nome curto para a tela e a descrição da cena que vai para a IA. */
export type CustomPhoto = { label: string; prompt: string };

export type KitConfig = {
  /** Total do kit, contando capa e fotos da loja. */
  total: number;
  coverWithCar: boolean;
  car?: { model: string; year: string };
  useExtraReference: boolean;
  includeStore: boolean;
  /** Tipos das fotos do meio, em ordem. */
  types: PhotoType[];
  /** Texto das fotos `custom`, no mesmo índice de `types` (null nas demais). */
  custom?: Array<CustomPhoto | null>;
};

export type Slot = {
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  type?: PhotoType;
  custom?: CustomPhoto;
  fixedIndex?: 0 | 1;
  warnMissingAngle: boolean;
};

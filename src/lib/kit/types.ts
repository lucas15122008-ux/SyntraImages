export type PhotoType =
  | 'white_front'
  | 'white_side'
  | 'white_detail'
  | 'white_back'
  | 'white_on_box'
  | 'use_hand'
  | 'use_installed';

export type KitConfig = {
  /** Total do kit, contando capa e fotos da loja. */
  total: number;
  coverWithCar: boolean;
  car?: { model: string; year: string };
  useExtraReference: boolean;
  includeStore: boolean;
  /** Tipos das fotos do meio, em ordem. */
  types: PhotoType[];
};

export type Slot = {
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  type?: PhotoType;
  fixedIndex?: 0 | 1;
  warnMissingAngle: boolean;
};

import { isReadyForDownload, type PhotoStatus } from './download';

export type PhotoRow = {
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  status: PhotoStatus;
  storage_path: string | null;
  warn_missing_angle: boolean;
  warn_dismissed: boolean;
};

export type KitSummary = {
  total: number;
  ready: number;
  warnings: number;
  failed: number;
  state: 'ready' | 'working' | 'attention';
  /** Caminho no storage da capa gerada, para a miniatura; null se ainda não existe. */
  coverPath: string | null;
};

/** Resume as fotos de um kit para o cartão da tela inicial. */
export function summarizeKit(photos: PhotoRow[]): KitSummary {
  const total = photos.length;
  const ready = photos.filter((p) => isReadyForDownload(p.status, !!p.storage_path)).length;
  const warnings = photos.filter((p) => p.warn_missing_angle && !p.warn_dismissed).length;
  const failed = photos.filter((p) => p.status === 'failed' && !p.storage_path).length;
  const cover = photos.find((p) => p.kind === 'cover' && isReadyForDownload(p.status, !!p.storage_path));
  const state = failed > 0 ? 'attention' : total > 0 && ready === total ? 'ready' : 'working';
  return { total, ready, warnings, failed, state, coverPath: cover?.storage_path ?? null };
}

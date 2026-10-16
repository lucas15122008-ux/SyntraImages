import { describe, expect, test } from 'vitest';
import { summarizeKit, type PhotoRow } from './summary';

const row = (over: Partial<PhotoRow> = {}): PhotoRow => ({
  position: 1,
  kind: 'generated',
  status: 'done',
  storage_path: 'k/1.jpg',
  warn_missing_angle: false,
  warn_dismissed: false,
  ...over,
});

describe('summarizeKit', () => {
  test('kit todo pronto, com a capa como miniatura', () => {
    const s = summarizeKit([row({ kind: 'cover', storage_path: 'k/capa.jpg' }), row({ position: 2 }), row({ position: 3, kind: 'fixed' })]);
    expect(s).toMatchObject({ total: 3, ready: 3, state: 'ready', coverPath: 'k/capa.jpg' });
  });

  test('fotos na fila ou gerando deixam o kit em andamento, sem miniatura de capa', () => {
    const s = summarizeKit([row({ kind: 'cover', status: 'generating', storage_path: null }), row({ position: 2, status: 'pending', storage_path: null })]);
    expect(s).toMatchObject({ ready: 0, state: 'working', coverPath: null });
  });

  test('foto que nunca gerou pede atenção; refação falha com imagem anterior ainda conta como pronta', () => {
    const s = summarizeKit([row({ status: 'failed', storage_path: null }), row({ position: 2, status: 'failed' })]);
    expect(s).toMatchObject({ ready: 1, failed: 1, state: 'attention' });
  });

  test('conta só os avisos não dispensados', () => {
    const s = summarizeKit([row({ warn_missing_angle: true }), row({ position: 2, warn_missing_angle: true, warn_dismissed: true })]);
    expect(s.warnings).toBe(1);
  });

  test('kit sem fotos não aparece como pronto', () => {
    expect(summarizeKit([]).state).toBe('working');
  });
});

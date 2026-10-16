// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { PhotoCard, type ReviewPhoto } from './PhotoCard';

const base: ReviewPhoto = {
  position: 2, kind: 'generated', type: 'white_front', status: 'done', url: 'https://img/a?token=1',
  version: 'u/k/2-1.jpg', stale: false, warn: false, error: null, attempts: 1,
};
const card = (photo: ReviewPhoto) => <PhotoCard photo={photo} originalUrl="o.jpg" busy={false} error={null} onRedo={vi.fn()} onToggleWarning={vi.fn()} />;

describe('PhotoCard: URLs assinadas que mudam a cada refresh', () => {
  test('mesma foto com URL nova não troca o <img> (sem piscar nem baixar de novo)', () => {
    const { rerender } = render(card(base));
    const first = screen.getByAltText('Foto 2');
    rerender(card({ ...base, url: 'https://img/a?token=2' }));
    const second = screen.getByAltText('Foto 2');
    expect(second).toBe(first);
    expect(second).toHaveAttribute('src', 'https://img/a?token=1');
  });

  test('foto refeita (arquivo novo) troca a imagem', () => {
    const { rerender } = render(card(base));
    rerender(card({ ...base, url: 'https://img/b?token=3', version: 'u/k/2-2.jpg', attempts: 2 }));
    expect(screen.getByAltText('Foto 2')).toHaveAttribute('src', 'https://img/b?token=3');
  });

  test('URL que chega depois da primeira renderização, para o mesmo arquivo, é usada', () => {
    const { rerender } = render(card({ ...base, url: null, status: 'failed' }));
    expect(screen.queryByAltText('Foto 2')).not.toBeInTheDocument();
    rerender(card(base));
    expect(screen.getByAltText('Foto 2')).toHaveAttribute('src', 'https://img/a?token=1');
  });
});

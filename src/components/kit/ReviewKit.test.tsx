// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ReviewKit, type ReviewPhoto } from './ReviewKit';

const photo = (position: number, over: Partial<ReviewPhoto> = {}): ReviewPhoto => ({
  position,
  kind: 'generated',
  type: 'white_front',
  status: 'done',
  url: `https://img/${position}.jpg`,
  version: `p${position}-1`,
  stale: false,
  warn: false,
  error: null,
  attempts: 1,
  ...over,
});

function setup(photos: ReviewPhoto[], over: Partial<React.ComponentProps<typeof ReviewKit>> = {}) {
  const generate = vi.fn().mockResolvedValue({ status: 'done', error: null });
  const setWarning = vi.fn().mockResolvedValue(undefined);
  const refresh = vi.fn();
  render(
    <ReviewKit
      title="Bomba de óleo · Gol 2012"
      originalUrl="https://img/original.jpg"
      photos={photos}
      generate={generate}
      setWarning={setWarning}
      refresh={refresh}
      downloadHref="/api/kits/k1/download"
      {...over}
    />,
  );
  return { generate, setWarning, refresh };
}

const card = (n: number) => screen.getByTestId(`photo-${n}`);

describe('ReviewKit', () => {
  test('mostra a foto original ao lado de cada foto gerada, mas não das fixas da loja', () => {
    setup([photo(1), photo(2), photo(3, { kind: 'fixed', type: null })]);
    expect(within(card(1)).getByAltText('Foto original')).toBeInTheDocument();
    expect(within(card(2)).getByAltText('Foto original')).toBeInTheDocument();
    expect(within(card(3)).queryByAltText('Foto original')).not.toBeInTheDocument();
    expect(within(card(3)).queryByRole('button', { name: /Refazer/ })).not.toBeInTheDocument();
  });

  test('fotos pendentes começam a gerar sozinhas, uma vez cada', async () => {
    const { generate } = setup([photo(1, { status: 'pending', url: null }), photo(2, { status: 'pending', url: null }), photo(3)]);
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(generate.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2]);
  });

  test('gera no máximo 3 fotos ao mesmo tempo', async () => {
    let running = 0;
    let peak = 0;
    const generate = vi.fn().mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { status: 'done', error: null };
    });
    setup(Array.from({ length: 8 }, (_, i) => photo(i + 1, { status: 'pending', url: null })), { generate });
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(8));
    await waitFor(() => expect(running).toBe(0));
    expect(peak).toBe(3);
  });

  test('cliques repetidos em Refazer geram uma vez só enquanto a foto está em andamento', async () => {
    let release!: () => void;
    const generate = vi.fn().mockImplementation(() => new Promise((res) => (release = () => res({ status: 'done', error: null }))));
    const { refresh } = setup([photo(2)], { generate });
    const btn = within(card(2)).getByRole('button', { name: 'Refazer' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(within(card(2)).getByRole('button', { name: /Refazendo/ })).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(within(card(2)).getByRole('button', { name: 'Refazer' })).toBeEnabled();
  });

  test('foto que falhou mostra o erro e botão de refazer; as outras seguem normais', () => {
    setup([photo(1), photo(2, { status: 'failed', url: null, error: 'O serviço de imagens falhou (HTTP 503).' }), photo(3)]);
    expect(within(card(2)).getByText(/HTTP 503/)).toBeInTheDocument();
    expect(within(card(2)).getByRole('button', { name: 'Refazer' })).toBeEnabled();
    expect(within(card(1)).queryByText(/falhou/i)).not.toBeInTheDocument();
    expect(within(card(3)).getByAltText(/Foto 3/)).toBeInTheDocument();
  });

  test('falha de rede ao refazer aparece na foto e permite tentar de novo', async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ status: 'done', error: null });
    setup([photo(2)], { generate });
    fireEvent.click(within(card(2)).getByRole('button', { name: 'Refazer' }));
    await waitFor(() => expect(within(card(2)).getByRole('alert')).toHaveTextContent(/não foi possível/i));
    fireEvent.click(within(card(2)).getByRole('button', { name: 'Refazer' }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  });

  test('o servidor devolvendo failed (ex.: limite diário) aparece como erro na foto', async () => {
    const generate = vi.fn().mockResolvedValue({ status: 'failed', error: 'Limite diário de 200 gerações atingido.' });
    setup([photo(2)], { generate });
    fireEvent.click(within(card(2)).getByRole('button', { name: 'Refazer' }));
    await waitFor(() => expect(within(card(2)).getByRole('alert')).toHaveTextContent(/Limite diário/));
  });

  test('o aviso de ângulo aparece só nas fotos marcadas e pode ser tirado ou posto', async () => {
    const { setWarning } = setup([photo(1), photo(2, { type: 'white_back', warn: true })]);
    expect(within(card(1)).queryByText(/pode não mostrar este ângulo/i)).not.toBeInTheDocument();
    expect(within(card(2)).getByText(/pode não mostrar este ângulo/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Foto 2/);
    fireEvent.click(within(card(2)).getByRole('button', { name: 'Tirar aviso' }));
    await waitFor(() => expect(setWarning).toHaveBeenCalledWith(2, false));
    fireEvent.click(within(card(1)).getByRole('button', { name: 'Marcar aviso' }));
    await waitFor(() => expect(setWarning).toHaveBeenCalledWith(1, true));
  });

  test('baixar kit só fica disponível quando todas as fotos estão prontas', () => {
    setup([photo(1), photo(2, { status: 'generating', url: null })]);
    expect(screen.getByRole('button', { name: 'Baixar kit' })).toBeDisabled();
  });

  test('com todas as fotos prontas, Baixar kit leva ao download', () => {
    setup([photo(1), photo(2)]);
    expect(screen.getByRole('link', { name: 'Baixar kit' })).toHaveAttribute('href', '/api/kits/k1/download');
  });

  test('fotos em geração mostram o estado e dão refresh periódico', async () => {
    vi.useFakeTimers();
    try {
      const { refresh } = setup([photo(1), photo(2, { status: 'generating', url: null })], { autoStart: false });
      expect(within(card(2)).getByText(/Gerando/)).toBeInTheDocument();
      await act(async () => void vi.advanceTimersByTime(5100));
      expect(refresh).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('foto presa em generating há mais de 5 minutos pode ser refeita', async () => {
    const { generate } = setup([photo(1), photo(2, { status: 'generating', url: null, stale: true })], { autoStart: false });
    expect(within(card(2)).getByRole('alert')).toHaveTextContent(/travou/i);
    const btn = within(card(2)).getByRole('button', { name: 'Refazer' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(generate).toHaveBeenCalledWith(2));
  });

  test('foto presa não faz a tela dar refresh a cada 5 segundos para sempre', async () => {
    vi.useFakeTimers();
    try {
      const { refresh } = setup([photo(2, { status: 'generating', url: null, stale: true })], { autoStart: false });
      await act(async () => void vi.advanceTimersByTime(12000));
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('refação que falhou mantém a foto anterior na tela, com o erro e o botão de refazer', () => {
    setup([photo(1), photo(2, { status: 'failed', error: 'O serviço de imagens falhou (HTTP 503).', version: 'p2-1' })]);
    expect(within(card(2)).getByAltText('Foto 2')).toHaveAttribute('src', 'https://img/2.jpg');
    expect(within(card(2)).getByText(/HTTP 503/)).toBeInTheDocument();
    expect(within(card(2)).getByRole('button', { name: 'Refazer' })).toBeEnabled();
  });

  test('com uma refação falhada que ainda tem foto anterior, o kit continua baixável', () => {
    setup([photo(1), photo(2, { status: 'failed', error: 'x' })]);
    expect(screen.getByRole('link', { name: 'Baixar kit' })).toBeInTheDocument();
  });

  test('foto que nunca foi gerada (failed sem imagem) bloqueia o download', () => {
    setup([photo(1), photo(2, { status: 'failed', url: null, version: null, error: 'x' })]);
    expect(screen.getByRole('button', { name: 'Baixar kit' })).toBeDisabled();
  });

  test('clicar numa foto abre a comparação com a original; setas trocam de foto e Esc fecha', async () => {
    setup([photo(1), photo(2), photo(3, { kind: 'fixed', type: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar foto 1 com a original' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText('Foto 1 ampliada')).toHaveAttribute('src', 'https://img/1.jpg');
    expect(within(dialog).getByAltText('Foto original ampliada')).toHaveAttribute('src', 'https://img/original.jpg');
    expect(within(dialog).getByRole('button', { name: 'Foto anterior' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(screen.getByRole('dialog')).getByAltText('Foto 2 ampliada')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('a arte fixa da loja abre sem a original e sem Refazer', () => {
    setup([photo(1), photo(2, { kind: 'fixed', type: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar foto 2' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByAltText('Foto original ampliada')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Refazer/ })).not.toBeInTheDocument();
  });

  test('Refazer na comparação gera só aquela foto e fecha a janela', async () => {
    const { generate } = setup([photo(1), photo(2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar foto 2 com a original' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refazer esta foto' }));
    await waitFor(() => expect(generate).toHaveBeenCalledWith(2));
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewKit: botões do título', () => {
  test('redo gera de novo as posições pedidas, no máximo 3 ao mesmo tempo', async () => {
    let running = 0;
    let peak = 0;
    const generate = vi.fn().mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { status: 'done', error: null };
    });
    setup([1, 2, 3, 4, 5].map((n) => photo(n)), {
      generate,
      actions: ({ redo }) => (
        <button type="button" onClick={() => redo([1, 2, 3, 4, 5])}>
          Refazer tudo
        </button>
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refazer tudo' }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(5));
    expect(peak).toBeLessThanOrEqual(3);
    expect(generate.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('avisa os botões quando ainda há foto gerando', () => {
    const seen: boolean[] = [];
    setup([photo(1, { status: 'generating', url: null }), photo(2)], {
      autoStart: false,
      actions: ({ working }) => {
        seen.push(working);
        return null;
      },
    });
    expect(seen.at(-1)).toBe(true);
  });
});

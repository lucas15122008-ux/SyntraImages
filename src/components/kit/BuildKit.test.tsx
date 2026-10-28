// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { prepareImage } from '@/lib/kit/client-image';
import type { KitConfig } from '@/lib/kit/types';
import { BuildKit } from './BuildKit';

vi.mock('@/lib/kit/client-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/kit/client-image')>()),
  prepareImage: vi.fn(async (file: File) => file),
}));

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])], 'peca.jpg', { type: 'image/jpeg' });

function setup(over: Partial<React.ComponentProps<typeof BuildKit>> = {}) {
  const onCreate = vi.fn().mockResolvedValue({ ok: true, kitId: 'kit-1' });
  const onCreated = vi.fn();
  const onSaveTemplate = vi.fn().mockResolvedValue('t1');
  render(<BuildKit templates={[]} storeReady onCreate={onCreate} onCreated={onCreated} onSaveTemplate={onSaveTemplate} {...over} />);
  return { onCreate, onCreated, onSaveTemplate };
}

const total = () => Number(screen.getByTestId('total').textContent);
const kinds = () => screen.getAllByRole('listitem').map((li) => li.getAttribute('data-kind'));
const minus = () => screen.getByRole('button', { name: 'Menos uma foto' });
const plus = () => screen.getByRole('button', { name: 'Mais uma foto' });
const storeSwitch = () => screen.getByRole('switch', { name: 'Fotos da loja no final' });

function fillValid() {
  fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Bomba de óleo' } });
  fireEvent.change(screen.getByLabelText('Modelo do carro'), { target: { value: 'Gol G5' } });
  fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2012' } });
  fireEvent.change(screen.getByLabelText('Foto do produto'), { target: { files: [photo()] } });
}

describe('BuildKit: quantidade', () => {
  test('começa com o kit padrão de 10 fotos: capa, 7 geradas, 2 fixas', () => {
    setup();
    expect(total()).toBe(10);
    expect(kinds()).toEqual(['cover', ...Array(7).fill('generated'), 'fixed', 'fixed']);
  });

  test('o botão de menos não passa do mínimo com a loja ligada (4) nem desligada (2)', () => {
    setup();
    for (let i = 0; i < 20; i++) fireEvent.click(minus());
    expect(total()).toBe(4);
    expect(minus()).toBeDisabled();
    expect(kinds()).toEqual(['cover', 'generated', 'fixed', 'fixed']);
    fireEvent.click(storeSwitch());
    for (let i = 0; i < 20; i++) fireEvent.click(minus());
    expect(total()).toBe(2);
    expect(kinds()).toEqual(['cover', 'generated']);
  });

  test('o botão de mais não passa de 16', () => {
    setup();
    for (let i = 0; i < 30; i++) fireEvent.click(plus());
    expect(total()).toBe(16);
    expect(plus()).toBeDisabled();
  });

  test('desligar a loja mantém o total e aumenta as fotos do meio', () => {
    setup();
    fireEvent.click(storeSwitch());
    expect(total()).toBe(10);
    expect(kinds().filter((k) => k === 'generated')).toHaveLength(9);
    expect(kinds()).not.toContain('fixed');
    fireEvent.click(storeSwitch());
    expect(total()).toBe(10);
    expect(kinds().filter((k) => k === 'generated')).toHaveLength(7);
  });

  test('ligar a loja com total abaixo do mínimo sobe o total para 4', () => {
    setup();
    fireEvent.click(storeSwitch());
    for (let i = 0; i < 20; i++) fireEvent.click(minus());
    expect(total()).toBe(2);
    fireEvent.click(storeSwitch());
    expect(total()).toBe(4);
  });

  test('o resumo diz quantas fotos serão geradas e quantas são fixas', () => {
    setup();
    expect(screen.getByTestId('resumo')).toHaveTextContent('Vai gerar 8 fotos com IA e juntar 2 fixas.');
    fireEvent.click(storeSwitch());
    expect(screen.getByTestId('resumo')).toHaveTextContent('Vai gerar 10 fotos com IA.');
  });
});

describe('BuildKit: capa e tipos', () => {
  test('trocar para capa comum esconde os campos do carro', () => {
    setup();
    expect(screen.getByLabelText('Modelo do carro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comum' }));
    expect(screen.queryByLabelText('Modelo do carro')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ano')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Com carro' }));
    expect(screen.getByLabelText('Modelo do carro')).toBeInTheDocument();
  });

  test('cada foto do meio tem seletor de tipo, e a troca fica registrada', () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText('Tipo da foto 2'), { target: { value: 'use_hand' } });
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    return waitFor(() => {
      const fd = onCreate.mock.calls[0][0] as FormData;
      const config = JSON.parse(String(fd.get('config'))) as KitConfig;
      expect(config.types[0]).toBe('use_hand');
    });
  });

  test('tipos que provavelmente não aparecem na foto original mostram o aviso', () => {
    setup();
    const li = screen.getAllByRole('listitem')[1];
    fireEvent.change(within(li).getByLabelText('Tipo da foto 2'), { target: { value: 'white_back' } });
    expect(within(li).getByText(/pode não ter este ângulo/i)).toBeInTheDocument();
  });

  test('a capa com carro cita o carro; a comum, fundo branco', () => {
    setup();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Peça com ');
    fireEvent.change(screen.getByLabelText('Modelo do carro'), { target: { value: 'Uno' } });
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2014' } });
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Peça com Uno 2014');
    fireEvent.click(screen.getByRole('button', { name: 'Comum' }));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Peça em fundo branco');
  });
});

describe('BuildKit: envio', () => {
  test('capa com carro sem modelo bloqueia a geração e aponta o campo', async () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Bomba' } });
    fireEvent.change(screen.getByLabelText('Foto do produto'), { target: { files: [photo()] } });
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2012' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    const field = screen.getByLabelText('Modelo do carro');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/modelo do carro/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test('sem foto ou sem nome não envia', () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/foto do produto/i);
  });

  test('arquivo que não é JPEG, PNG ou WEBP é recusado já na escolha', () => {
    setup();
    const heic = new File([new Uint8Array(4)], 'IMG.HEIC', { type: 'image/heic' });
    fireEvent.change(screen.getByLabelText('Foto do produto'), { target: { files: [heic] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG ou WEBP/);
  });

  test('envia nome, configuração e arquivos e avisa quando o kit é criado', async () => {
    const { onCreate, onCreated } = setup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('kit-1'));
    const fd = onCreate.mock.calls[0][0] as FormData;
    expect(fd.get('productName')).toBe('Bomba de óleo');
    expect(fd.get('original')).toBeInstanceOf(File);
    const config = JSON.parse(String(fd.get('config'))) as KitConfig;
    expect(config).toMatchObject({ total: 10, coverWithCar: true, includeStore: true, car: { model: 'Gol G5', year: '2012' } });
    expect(config.types).toHaveLength(7);
  });

  test('erro do servidor aparece na tela e o formulário continua disponível', async () => {
    const { onCreated } = setup({ onCreate: vi.fn().mockResolvedValue({ ok: false, error: 'Limite diário atingido.' }) });
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Limite diário atingido.'));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Gerar fotos' })).toBeEnabled();
  });

  test('com a loja ligada e sem artes, avisa e aponta para Configurações', () => {
    setup({ storeReady: false });
    expect(screen.getByText(/Suba as artes da loja em Configurações/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Configurações/ })).toHaveAttribute('href', '/configuracoes/loja');
    fireEvent.click(storeSwitch());
    expect(screen.queryByText(/Suba as artes da loja em Configurações/)).not.toBeInTheDocument();
  });

  test('referência extra ligada pede o arquivo', () => {
    const { onCreate } = setup();
    fillValid();
    fireEvent.click(screen.getByRole('switch', { name: 'Usar foto de referência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/referência/i);
  });
});

describe('BuildKit: modelos de kit', () => {
  const tpl = { id: 't1', name: 'Kit enxuto', config: { total: 6, coverWithCar: false, useExtraReference: false, includeStore: false, types: ['use_hand', 'white_side'] } as KitConfig };

  test('aplicar um modelo muda quantidade, capa, loja e tipos, sem mexer no carro', () => {
    setup({ templates: [tpl] });
    fireEvent.change(screen.getByLabelText('Modelo do carro'), { target: { value: 'Uno' } });
    fireEvent.change(screen.getByLabelText('Modelo de kit'), { target: { value: 't1' } });
    expect(total()).toBe(6);
    expect(storeSwitch()).toHaveAttribute('aria-checked', 'false');
    expect((screen.getByLabelText('Tipo da foto 2') as HTMLSelectElement).value).toBe('use_hand');
    expect((screen.getByLabelText('Tipo da foto 3') as HTMLSelectElement).value).toBe('white_side');
    fireEvent.click(screen.getByRole('button', { name: 'Com carro' }));
    expect((screen.getByLabelText('Modelo do carro') as HTMLInputElement).value).toBe('Uno');
  });

  test('salvar como modelo envia a configuração atual com o nome digitado', async () => {
    const { onSaveTemplate } = setup();
    fireEvent.change(screen.getByLabelText('Nome do modelo'), { target: { value: 'Meu kit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como modelo' }));
    await waitFor(() => expect(onSaveTemplate).toHaveBeenCalledTimes(1));
    expect(onSaveTemplate.mock.calls[0][0]).toBe('Meu kit');
    expect(onSaveTemplate.mock.calls[0][1]).toMatchObject({ total: 10, includeStore: true });
  });

  test('salvar modelo sem nome mostra erro e não envia', () => {
    const { onSaveTemplate } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como modelo' }));
    expect(onSaveTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/nome do modelo/i);
  });

  test('com uma imagem, ela recebe todo o orçamento de envio (cabe nos 4,5 MB da Vercel)', async () => {
    const prepare = vi.mocked(prepareImage);
    prepare.mockClear();
    const { onCreated } = setup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(prepare.mock.calls.map((c) => c[1])).toEqual([3_200_000]);
  });

  test('com referência extra, o orçamento de envio é dividido entre as duas imagens', async () => {
    const prepare = vi.mocked(prepareImage);
    prepare.mockClear();
    const { onCreated } = setup();
    fillValid();
    fireEvent.click(screen.getByRole('switch', { name: 'Usar foto de referência' }));
    fireEvent.change(screen.getByLabelText('Imagem de referência'), { target: { files: [photo()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(prepare.mock.calls.map((c) => c[1])).toEqual([1_600_000, 1_600_000]);
  });
});

describe('BuildKit: foto personalizada', () => {
  test('escolher "Personalizada" abre a descrição e manda o texto no config', async () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText('Tipo da foto 3'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Nome da foto 3'), { target: { value: 'Bancada' } });
    fireEvent.change(screen.getByLabelText('Descrição da foto 3'), { target: { value: 'peça sobre bancada de madeira' } });
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const config = JSON.parse(String((onCreate.mock.calls[0][0] as FormData).get('config'))) as KitConfig;
    expect(config.types[1]).toBe('custom');
    expect(config.custom?.[1]).toEqual({ label: 'Bancada', prompt: 'peça sobre bancada de madeira' });
    expect(config.custom?.[0]).toBeNull();
  });

  test('sem descrição não gera e marca o campo', () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText('Tipo da foto 2'), { target: { value: 'custom' } });
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar fotos' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/Descreva a foto personalizada \(posição 2\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição da foto 2')).toHaveAttribute('aria-invalid', 'true');
  });

  test('salvar deixa a foto na lista "Salvas pela equipe" e escolher uma salva preenche o texto', async () => {
    const onSaveCustom = vi.fn().mockResolvedValue({ id: 's1', name: 'Bancada', prompt: 'peça na bancada' });
    setup({ onSaveCustom, savedCustom: [{ id: 's0', name: 'Com pneu', prompt: 'peça ao lado de um pneu' }] });
    fireEvent.change(screen.getByLabelText('Tipo da foto 2'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Nome da foto 2'), { target: { value: 'Bancada' } });
    fireEvent.change(screen.getByLabelText('Descrição da foto 2'), { target: { value: 'peça na bancada' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar para usar de novo/ }));
    await waitFor(() => expect(screen.getByText('salva')).toBeInTheDocument());
    expect(onSaveCustom).toHaveBeenCalledWith('Bancada', 'peça na bancada');
    expect(screen.getByLabelText('Tipo da foto 2')).toHaveValue('saved:s1');

    fireEvent.change(screen.getByLabelText('Tipo da foto 4'), { target: { value: 'saved:s0' } });
    expect(screen.getByLabelText('Descrição da foto 4')).toHaveValue('peça ao lado de um pneu');
    expect(screen.getByLabelText('Nome da foto 4')).toHaveValue('Com pneu');
  });
});

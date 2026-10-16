'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMotionPresets } from '@/components/motion/presets';
import { isAllowedImage, prepareImage, submitBudget } from '@/lib/kit/client-image';
import { STORE_LABELS, TYPE_LABELS } from '@/lib/kit/labels';
import { MAX_TOTAL, PHOTO_TYPES, defaultMiddleTypes, minTotal, planKit, validateConfig } from '@/lib/kit/plan';
import type { KitConfig, PhotoType } from '@/lib/kit/types';

export type TemplateOption = { id: string; name: string; config: KitConfig };
export type CreateResult = { ok: true; kitId: string } | { ok: false; error: string };

type Props = {
  templates: TemplateOption[];
  /** As duas artes da loja já foram enviadas. */
  storeReady: boolean;
  onCreate: (formData: FormData) => Promise<CreateResult>;
  onCreated: (kitId: string) => void;
  onSaveTemplate: (name: string, config: KitConfig) => Promise<string>;
};

type Errors = Partial<Record<'name' | 'photo' | 'model' | 'year' | 'reference' | 'template' | 'server' | 'total', string>>;

const TYPE_POOL = defaultMiddleTypes(MAX_TOTAL);
const FIELD_IDS: Record<string, string> = {
  name: 'product-name',
  photo: 'product-photo',
  model: 'car-model',
  year: 'car-year',
  reference: 'extra-photo',
};

export function BuildKit({ templates, storeReady, onCreate, onCreated, onSaveTemplate }: Props) {
  const [productName, setProductName] = useState('');
  const [original, setOriginal] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [extra, setExtra] = useState<File | null>(null);
  const [useExtraReference, setUseExtraReference] = useState(false);
  const [total, setTotal] = useState(10);
  const [includeStore, setIncludeStore] = useState(true);
  const [coverWithCar, setCoverWithCar] = useState(true);
  const [car, setCar] = useState({ model: '', year: '' });
  const [types, setTypes] = useState<PhotoType[]>(TYPE_POOL);
  const [templateName, setTemplateName] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const { listItem } = useMotionPresets();

  const min = minTotal(includeStore);
  const config: KitConfig = useMemo(
    () => ({
      total,
      coverWithCar,
      car: coverWithCar ? { model: car.model.trim(), year: car.year.trim() } : undefined,
      useExtraReference,
      includeStore,
      types: types.slice(0, Math.max(0, total - 1 - (includeStore ? 2 : 0))),
    }),
    [total, coverWithCar, car, useExtraReference, includeStore, types],
  );
  const slots = useMemo(() => planKit(config), [config]);
  const fixed = slots.filter((s) => s.kind === 'fixed').length;
  const generated = slots.length - fixed;

  function toggleStore() {
    const next = !includeStore;
    setIncludeStore(next);
    if (next && total < minTotal(true)) setTotal(minTotal(true));
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTotal(t.config.total);
    setCoverWithCar(t.config.coverWithCar);
    setUseExtraReference(t.config.useExtraReference);
    setIncludeStore(t.config.includeStore);
    setTypes(TYPE_POOL.map((fallback, i) => t.config.types[i] ?? fallback));
  }

  function pickPhoto(file: File | undefined, which: 'photo' | 'reference') {
    const setFile = which === 'photo' ? setOriginal : setExtra;
    if (!file) return setFile(null);
    if (!isAllowedImage(file)) {
      setFile(null);
      return setErrors((e) => ({
        ...e,
        [which]: 'A foto precisa ser JPEG, PNG ou WEBP. Fotos HEIC do iPhone: exporte como JPEG antes de enviar.',
      }));
    }
    setErrors((e) => ({ ...e, [which]: undefined }));
    setFile(file);
    if (which === 'photo') {
      if (originalPreview) URL.revokeObjectURL(originalPreview);
      setOriginalPreview(URL.createObjectURL(file));
    }
  }

  function validate(): Errors {
    const found: Errors = {};
    if (!productName.trim()) found.name = 'Informe o nome do produto.';
    if (!original) found.photo = errors.photo ?? 'Escolha a foto do produto.';
    if (coverWithCar && !car.model.trim()) found.model = 'Informe o modelo do carro para a capa com carro.';
    if (coverWithCar && !car.year.trim()) found.year = 'Informe o ano do carro para a capa com carro.';
    if (useExtraReference && !extra) found.reference = errors.reference ?? 'Escolha a imagem de referência ou desligue a opção.';
    const rest = validateConfig(config).filter((m) => !/carro/.test(m));
    if (rest.length) found.total = rest.join(' ');
    return found;
  }

  async function submit() {
    const found = validate();
    setErrors(found);
    const first = (['name', 'photo', 'model', 'year', 'reference'] as const).find((k) => found[k]);
    if (first) return void document.getElementById(FIELD_IDS[first])?.focus();
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('productName', productName.trim());
      fd.set('config', JSON.stringify(config));
      const withExtra = useExtraReference && !!extra;
      const budget = submitBudget(withExtra ? 2 : 1);
      fd.set('original', await prepareImage(original!, budget));
      if (withExtra) fd.set('extraReference', await prepareImage(extra!, budget));
      const result = await onCreate(fd);
      if (result.ok) onCreated(result.kitId);
      else setErrors({ server: result.error });
    } catch (e) {
      setErrors({ server: e instanceof Error ? e.message : 'Não foi possível criar o kit.' });
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return setErrors((e) => ({ ...e, template: 'Informe o nome do modelo.' }));
    setErrors((e) => ({ ...e, template: undefined }));
    try {
      await onSaveTemplate(templateName.trim(), config);
      setTemplateName('');
    } catch (e) {
      setErrors((x) => ({ ...x, template: e instanceof Error ? e.message : 'Não foi possível salvar o modelo.' }));
    }
  }

  const fieldError = (key: keyof Errors) =>
    errors[key] ? (
      <p className="field-error" role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="cols">
      <div className="panel">
        <div className="field">
          <span className="label">Foto do produto</span>
          <label className="drop" htmlFor="product-photo">
            <span className="pic">
              {originalPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob)
                <img src={originalPreview} alt="Prévia da foto do produto" />
              ) : (
                <span>foto do fornecedor</span>
              )}
            </span>
            <span>
              {original ? original.name : 'Escolher a foto'}
              <small>JPEG, PNG ou WEBP, até 10 MB</small>
            </span>
          </label>
          <input
            id="product-photo"
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Foto do produto"
            aria-invalid={!!errors.photo}
            onChange={(e) => pickPhoto(e.target.files?.[0], 'photo')}
          />
          {fieldError('photo')}
        </div>

        <div className="field">
          <span className="label">Nome do produto</span>
          <input
            id="product-name"
            type="text"
            value={productName}
            placeholder="Ex.: Bomba de óleo"
            aria-label="Nome do produto"
            aria-invalid={!!errors.name}
            onChange={(e) => setProductName(e.target.value)}
          />
          {fieldError('name')}
        </div>

        {coverWithCar && (
          <div className="field">
            <span className="label">Carro da capa</span>
            <div className="row2">
              <input
                id="car-model"
                type="text"
                value={car.model}
                placeholder="Modelo"
                aria-label="Modelo do carro"
                aria-invalid={!!errors.model}
                onChange={(e) => setCar({ ...car, model: e.target.value })}
              />
              <input
                id="car-year"
                type="text"
                value={car.year}
                placeholder="Ano"
                aria-label="Ano"
                aria-invalid={!!errors.year}
                onChange={(e) => setCar({ ...car, year: e.target.value })}
              />
            </div>
            {fieldError('model')}
            {fieldError('year')}
          </div>
        )}

        <div className="field">
          <span className="label">Quantidade de fotos</span>
          <div className="stepper">
            <button type="button" aria-label="Menos uma foto" disabled={total <= min} onClick={() => setTotal((t) => Math.max(min, t - 1))}>
              −
            </button>
            <output data-testid="total" aria-label="Quantidade de fotos">
              {total}
            </output>
            <button type="button" aria-label="Mais uma foto" disabled={total >= MAX_TOTAL} onClick={() => setTotal((t) => Math.min(MAX_TOTAL, t + 1))}>
              +
            </button>
            <span className="note">no total, contando a capa e as fixas</span>
          </div>
          {fieldError('total')}
        </div>

        <div className="field">
          <span className="label">Capa</span>
          <div className="seg">
            <button type="button" aria-pressed={!coverWithCar} onClick={() => setCoverWithCar(false)}>
              Comum
            </button>
            <button type="button" aria-pressed={coverWithCar} onClick={() => setCoverWithCar(true)}>
              Com carro
            </button>
          </div>
        </div>

        <div className="switch">
          <div>
            Usar foto de referência
            <small>Estilo, cena ou carro, além da foto do produto</small>
          </div>
          <button type="button" className="tog" role="switch" aria-checked={useExtraReference} aria-label="Usar foto de referência" onClick={() => setUseExtraReference((v) => !v)} />
        </div>
        {useExtraReference && (
          <div className="field">
            <input
              id="extra-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Imagem de referência"
              aria-invalid={!!errors.reference}
              onChange={(e) => pickPhoto(e.target.files?.[0], 'reference')}
            />
            {fieldError('reference')}
          </div>
        )}

        <div className="switch">
          <div>
            Fotos da loja no final
            <small>2 imagens fixas, sem custo de geração</small>
          </div>
          <button type="button" className="tog" role="switch" aria-checked={includeStore} aria-label="Fotos da loja no final" onClick={toggleStore} />
        </div>
        {includeStore && !storeReady && (
          <p className="alert" role="note">
            <span>Suba as artes da loja em Configurações antes de gerar o kit.</span> <Link href="/configuracoes/loja">Abrir Configurações</Link>
          </p>
        )}

        <div className="field">
          <span className="label">Modelos de kit</span>
          <select aria-label="Modelo de kit" value="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">{templates.length ? 'Aplicar um modelo…' : 'Nenhum modelo salvo'}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="row2 template-save">
            <input type="text" value={templateName} placeholder="Nome do modelo" aria-label="Nome do modelo" onChange={(e) => setTemplateName(e.target.value)} />
            <button type="button" className="btn ghost" onClick={saveTemplate}>
              Salvar como modelo
            </button>
          </div>
          {fieldError('template')}
        </div>
      </div>

      <div className="panel">
        <div className="head">
          <h2>Kit proposto</h2>
          <span className="note">Troque o tipo de qualquer foto ou ajuste a quantidade ao lado.</span>
        </div>
        <ol className="slots">
          {slots.map((slot) => (
            <motion.li key={slot.position} className="slot" data-kind={slot.kind} layout="position" variants={listItem} initial="hidden" animate="visible">
              <span className="n">{slot.position}</span>
              <span className={`t ${slot.kind === 'cover' ? 'cover' : slot.kind === 'fixed' ? 'fixed' : slot.type?.startsWith('use') ? 'use' : 'white'}`} />
              <div>
                {slot.kind === 'generated' ? (
                  <>
                    <select
                      aria-label={`Tipo da foto ${slot.position}`}
                      value={slot.type}
                      onChange={(e) => setTypes((prev) => prev.map((t, i) => (i === slot.position - 2 ? (e.target.value as PhotoType) : t)))}
                    >
                      {PHOTO_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    {slot.warnMissingAngle && <div className="meta"><span className="pill warn">pode não ter este ângulo na foto original</span></div>}
                  </>
                ) : slot.kind === 'cover' ? (
                  <>
                    <strong>Capa</strong>
                    <div className="meta">{coverWithCar ? `Peça com ${car.model.trim() || 'carro'} ${car.year.trim()}`.trim() : 'Peça em fundo branco'}</div>
                  </>
                ) : (
                  <>
                    <strong>{STORE_LABELS[slot.fixedIndex ?? 0]}</strong>
                    <div className="meta">Imagem fixa</div>
                  </>
                )}
              </div>
              <span className={`pill ${slot.kind === 'fixed' ? 'free' : 'gen'}`}>{slot.kind === 'fixed' ? 'sem custo' : 'IA'}</span>
            </motion.li>
          ))}
        </ol>
        {errors.server && (
          <p className="alert" role="alert">
            {errors.server}
          </p>
        )}
        <div className="cta">
          <span className="note" data-testid="resumo">
            {`Vai gerar ${generated} fotos com IA${fixed ? ` e juntar ${fixed} fixas.` : '.'}`}
          </span>
          <button type="button" className="btn" disabled={busy} onClick={submit}>
            {busy ? 'Criando…' : 'Gerar fotos'}
          </button>
        </div>
      </div>
    </div>
  );
}

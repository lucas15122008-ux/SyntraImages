'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMotionPresets } from '@/components/motion/presets';
import { Icon, type IconName } from '@/components/ui/Icon';
import { isAllowedImage, prepareImage, submitBudget } from '@/lib/kit/client-image';
import { STORE_LABELS, TYPE_LABELS } from '@/lib/kit/labels';
import { MAX_TOTAL, PHOTO_TYPES, defaultMiddleTypes, minTotal, planKit, validateConfig } from '@/lib/kit/plan';
import type { KitConfig, PhotoType, Slot } from '@/lib/kit/types';
import { PhotoDrop } from './PhotoDrop';

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
const TYPE_ICONS: Record<PhotoType, IconName> = {
  white_front: 'front',
  white_side: 'side',
  white_detail: 'zoom',
  white_back: 'back',
  white_on_box: 'box',
  use_hand: 'hand',
  use_installed: 'car',
};

function thumbOf(slot: Slot): { cls: string; icon: IconName } {
  if (slot.kind === 'cover') return { cls: 'cover', icon: 'sparkles' };
  if (slot.kind === 'fixed') return { cls: 'fixed', icon: 'store' };
  return { cls: slot.type?.startsWith('use') ? 'use' : 'white', icon: slot.type ? TYPE_ICONS[slot.type] : 'image' };
}

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
  const { listItem, reduced } = useMotionPresets();

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
  const spring = reduced ? { duration: 0 } : ({ type: 'spring', stiffness: 460, damping: 36 } as const);

  return (
    <div className="cols">
      <div className="panel">
        <div className="section">
          <div className="field">
            <span className="label">Foto do produto</span>
            <PhotoDrop id="product-photo" label="Foto do produto" file={original} invalid={!!errors.photo} onPick={(f) => pickPhoto(f, 'photo')} />
            {fieldError('photo')}
          </div>

          <div className="field">
            <label className="label" htmlFor="product-name">
              Nome do produto
            </label>
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
        </div>

        <div className="section">
          <div className="field">
            <span className="label">Capa</span>
            <div className="seg">
              {([
                [false, 'Comum', 'image'],
                [true, 'Com carro', 'car'],
              ] as const).map(([value, text, icon]) => (
                <button key={text} type="button" aria-pressed={coverWithCar === value} onClick={() => setCoverWithCar(value)}>
                  {coverWithCar === value && <motion.span layoutId="cover-pill" className="seg-pill" transition={spring} />}
                  <Icon name={icon} size={16} />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Some na hora (sem animação de saída) para o campo não ficar na tela depois de escondido. */}
          {coverWithCar && (
            <motion.div
              className="field"
              style={{ overflow: 'hidden' }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="label">Carro da capa</span>
              <div className="row2">
                <input
                  id="car-model"
                  type="text"
                  value={car.model}
                  placeholder="Modelo, ex.: Gol G5"
                  aria-label="Modelo do carro"
                  aria-invalid={!!errors.model}
                  onChange={(e) => setCar({ ...car, model: e.target.value })}
                />
                <input
                  id="car-year"
                  type="text"
                  inputMode="numeric"
                  value={car.year}
                  placeholder="Ano"
                  aria-label="Ano"
                  aria-invalid={!!errors.year}
                  onChange={(e) => setCar({ ...car, year: e.target.value })}
                />
              </div>
              {fieldError('model')}
              {fieldError('year')}
            </motion.div>
          )}

          <div className="field">
            <span className="label">Quantidade de fotos</span>
            <div className="stepper">
              <button type="button" aria-label="Menos uma foto" disabled={total <= min} onClick={() => setTotal((t) => Math.max(min, t - 1))}>
                <Icon name="minus" />
              </button>
              <span className="count">
                <motion.output
                  key={total}
                  data-testid="total"
                  aria-label="Quantidade de fotos"
                  initial={reduced ? false : { y: 14, opacity: 0, filter: 'blur(4px)' }}
                  animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {total}
                </motion.output>
              </span>
              <button type="button" aria-label="Mais uma foto" disabled={total >= MAX_TOTAL} onClick={() => setTotal((t) => Math.min(MAX_TOTAL, t + 1))}>
                <Icon name="plus" />
              </button>
              <span className="note">no total, contando a capa e as fixas</span>
            </div>
            {fieldError('total')}
          </div>
        </div>

        <div className="section">
          <div className="switch">
            <div>
              Usar foto de referência
              <small>Estilo, cena ou carro, além da foto do produto</small>
            </div>
            <button type="button" className="tog" role="switch" aria-checked={useExtraReference} aria-label="Usar foto de referência" onClick={() => setUseExtraReference((v) => !v)} />
          </div>
          {useExtraReference && (
            <div className="field">
              <PhotoDrop
                id="extra-photo"
                label="Imagem de referência"
                compact
                title="Solte a imagem de referência"
                hint="ou clique para escolher"
                file={extra}
                invalid={!!errors.reference}
                onPick={(f) => pickPhoto(f, 'reference')}
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
              <Icon name="alert" size={16} />
              <span>
                <span>Suba as artes da loja em Configurações antes de gerar o kit.</span> <Link href="/configuracoes/loja">Abrir Configurações</Link>
              </span>
            </p>
          )}
        </div>

        <div className="section">
          <div className="field">
            <span className="label">
              <Icon name="bookmark" size={14} /> Modelos de kit
            </span>
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
      </div>

      <div className="panel">
        <div className="head">
          <h2>Kit proposto</h2>
          <span className="note">Troque o tipo de qualquer foto ou ajuste a quantidade ao lado.</span>
        </div>
        <ol className="slots">
          {slots.map((slot) => {
              const thumb = thumbOf(slot);
              return (
                <motion.li
                  key={slot.kind === 'fixed' ? `fixed-${slot.fixedIndex}` : slot.position}
                  className="slot"
                  data-kind={slot.kind}
                  layout="position"
                  variants={listItem}
                  initial="hidden"
                  animate="visible"
                >
                  <span className="n">{slot.position}</span>
                  <span className={`t ${thumb.cls}`}>
                    <Icon name={thumb.icon} size={20} />
                  </span>
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
                        {slot.warnMissingAngle && (
                          <div className="meta">
                            <span className="pill warn">
                              <Icon name="alert" size={12} /> pode não ter este ângulo na foto original
                            </span>
                          </div>
                        )}
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
              );
            })}
        </ol>
        {errors.server && (
          <p className="alert" role="alert">
            {errors.server}
          </p>
        )}
        <div className="cta">
          <div className="summary">
            <span className="pill gen num">
              <Icon name="sparkles" size={12} /> {generated} com IA
            </span>
            {fixed > 0 && <span className="pill free num">{fixed} fixas</span>}
            <span className="note" data-testid="resumo">
              {`Vai gerar ${generated} fotos com IA${fixed ? ` e juntar ${fixed} fixas.` : '.'}`}
            </span>
          </div>
          <button type="button" className="btn lg" disabled={busy} onClick={submit}>
            {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden="true" /> : <Icon name="sparkles" />}
            {busy ? 'Criando…' : 'Gerar fotos'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';
import { editKitAction } from '@/lib/kit/actions';
import { DialogError } from './DialogError';
import { GlassDialog } from './GlassDialog';

export type KitInfo = { productName: string; coverWithCar: boolean; carModel: string; carYear: string };

type Props = {
  kitId: string;
  info: KitInfo;
  /** Refaz a capa (chamado depois de salvar, quando o carro mudou e a pessoa pediu). */
  onRedoCover: () => void;
};

const carKey = (withCar: boolean, model: string, year: string) => (withCar && model.trim() && year.trim() ? `${model.trim()}|${year.trim()}` : '');

/** "Editar kit": nome do produto e carro da capa, num pop-up de vidro. */
export function EditKitButton({ kitId, info, onRedoCover }: Props) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(info);
  const [redoCover, setRedoCover] = useState(true);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  function openDialog() {
    setForm(info);
    setRedoCover(true);
    setError(null);
    setOpen(true);
  }

  const coverChanged = carKey(form.coverWithCar, form.carModel, form.carYear) !== carKey(info.coverWithCar, info.carModel, info.carYear);
  const dirty = coverChanged || form.productName.trim() !== info.productName;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await editKitAction(kitId, {
      productName: form.productName,
      coverWithCar: form.coverWithCar,
      car: { model: form.carModel, year: form.carYear },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
    if (res.coverChanged && redoCover) onRedoCover();
  }

  const spring = reduced ? { duration: 0 } : ({ type: 'spring', stiffness: 460, damping: 36 } as const);

  return (
    <>
      <button type="button" className="btn ghost" onClick={openDialog}>
        <Icon name="pen" size={16} />
        Editar kit
      </button>
      <GlassDialog open={open} busy={busy} onClose={close} initialFocus={nameRef} labelledBy="edit-title" wide>
        <form className="edit-form" onSubmit={(e) => void save(e)} noValidate>
          <div className="confirm-text edit-head">
            <span className="edit-icon" aria-hidden="true">
              <Icon name="pen" size={20} />
            </span>
            <h2 id="edit-title">Editar kit</h2>
            <p className="confirm-name">As fotos prontas não mudam. Os dados novos valem nas próximas gerações.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="edit-name">
              Nome do produto
            </label>
            <input
              ref={nameRef}
              id="edit-name"
              type="text"
              value={form.productName}
              maxLength={120}
              placeholder="Ex.: Bomba de óleo"
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
            />
          </div>

          <div className="field">
            <span className="label">Capa</span>
            <div className="seg">
              {([
                [false, 'Comum', 'image'],
                [true, 'Com carro', 'car'],
              ] as const).map(([value, text, icon]) => (
                <button key={text} type="button" aria-pressed={form.coverWithCar === value} onClick={() => setForm({ ...form, coverWithCar: value })}>
                  {form.coverWithCar === value && <motion.span layoutId="edit-cover-pill" className="seg-pill" transition={spring} />}
                  <Icon name={icon} size={16} />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>

          {form.coverWithCar && (
            <motion.div
              className="field"
              style={{ overflow: 'hidden' }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="label">Carro da capa</span>
              <div className="row2">
                <input type="text" value={form.carModel} placeholder="Modelo, ex.: Gol G5" aria-label="Modelo do carro" onChange={(e) => setForm({ ...form, carModel: e.target.value })} />
                <input type="text" inputMode="numeric" value={form.carYear} placeholder="Ano" aria-label="Ano" onChange={(e) => setForm({ ...form, carYear: e.target.value })} />
              </div>
            </motion.div>
          )}

          {coverChanged && (
            <motion.div
              className="switch edit-redo"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div>
                Refazer a capa com o novo carro
                <small>A capa atual mostra o carro antigo. Usa 1 geração.</small>
              </div>
              <button type="button" className="tog" role="switch" aria-checked={redoCover} aria-label="Refazer a capa com o novo carro" onClick={() => setRedoCover((v) => !v)} />
            </motion.div>
          )}

          <DialogError error={error} />

          <div className="confirm-actions">
            <button type="button" className="btn soft" onClick={close} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={busy || !dirty}>
              {busy ? <span className="btn-spinner" aria-hidden="true" /> : <Icon name="check" size={16} />}
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </GlassDialog>
    </>
  );
}

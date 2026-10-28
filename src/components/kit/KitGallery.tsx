'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useMotionPresets } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';
import { DeleteKitButton } from './DeleteKitButton';
import type { KitSummary } from '@/lib/kit/summary';

export type KitCardData = {
  id: string;
  name: string;
  car: string;
  createdAt: string;
  thumbUrl: string | null;
  summary: KitSummary;
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function StatePill({ s }: { s: KitSummary }) {
  if (s.state === 'attention') return <span className="pill bad">{s.failed === 1 ? '1 falhou' : `${s.failed} falharam`}</span>;
  if (s.state === 'ready') return <span className="pill ok"><Icon name="check" size={12} /> pronto</span>;
  return <span className="pill gen num">{s.ready} de {s.total}</span>;
}

/** Grade dos kits: cada cartão mostra a capa, o progresso e os avisos. Os cartões entram em cascata. */
export function KitGallery({ kits }: { kits: KitCardData[] }) {
  const { listItem, reduced } = useMotionPresets();
  return (
    <motion.ul
      className="kits"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : 0.05 } } }}
    >
      <motion.li variants={listItem}>
        <Link className="kit-new" href="/kits/novo">
          <span className="drop-icon"><Icon name="plus" size={24} /></span>
          Novo kit
          <span className="note">Comece de uma foto da peça</span>
        </Link>
      </motion.li>
      <AnimatePresence mode="popLayout">
        {kits.map((k) => (
          <motion.li
            key={k.id}
            layout={!reduced}
            variants={listItem}
            className="kit-item"
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, filter: 'blur(6px)', transition: { duration: 0.3 } }}
          >
            <Link className="kit-card" href={`/kits/${k.id}`}>
              <div className="cover">
                {k.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage
                  <img src={k.thumbUrl} alt="" loading="lazy" />
                ) : (
                  <Icon name="image" size={28} />
                )}
                <StatePill s={k.summary} />
              </div>
              <div className="body">
                <h3>{k.name}</h3>
                <span className="meta">
                  <span>{k.car ? <><Icon name="car" size={14} />{k.car}</> : <><Icon name="layers" size={14} />{k.summary.total} fotos</>}</span>
                  <span className="num"><Icon name="clock" size={14} />{dateFmt.format(new Date(k.createdAt))}</span>
                </span>
                {k.summary.warnings > 0 && (
                  <span className="meta" style={{ color: 'var(--warn)' }}>
                    <span><Icon name="alert" size={14} />{k.summary.warnings === 1 ? '1 foto com aviso' : `${k.summary.warnings} fotos com aviso`}</span>
                  </span>
                )}
                <span className="progress" role="progressbar" aria-label="Fotos prontas" aria-valuemin={0} aria-valuemax={k.summary.total} aria-valuenow={k.summary.ready}>
                  <span style={{ width: `${k.summary.total ? (k.summary.ready / k.summary.total) * 100 : 0}%` }} />
                </span>
              </div>
            </Link>
            <DeleteKitButton kitId={k.id} name={k.name} thumbUrl={k.thumbUrl} compact />
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

/** Primeira visita: explica o fluxo em três passos e leva direto ao primeiro kit. */
export function KitEmptyState() {
  return (
    <section className="panel empty">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2>Uma foto da peça vira um kit inteiro de anúncio.</h2>
        <ol className="how">
          <li>
            <span><Icon name="upload" /></span>
            <span>Suba a foto do fornecedor<small>JPEG, PNG ou WEBP, pode ter fundo sujo</small></span>
          </li>
          <li>
            <span><Icon name="layers" /></span>
            <span>Ajuste o kit proposto<small>Quantidade, capa com carro, tipo de cada foto</small></span>
          </li>
          <li>
            <span><Icon name="sparkles" /></span>
            <span>Revise e baixe<small>Compare com a original e refaça só o que ficou ruim</small></span>
          </li>
        </ol>
        <div>
          <Link className="btn lg" href="/kits/novo">
            <Icon name="plus" /> Montar o primeiro kit
          </Link>
        </div>
      </div>
      <div className="empty-art" aria-hidden="true">
        <span className="tile a"><Icon name="front" size={26} /></span>
        <span className="tile b"><Icon name="car" size={26} /></span>
        <span className="tile main"><Icon name="image" size={44} /></span>
        <span className="tile c"><Icon name="box" size={26} /></span>
        <span className="tile d"><Icon name="hand" size={24} /></span>
      </div>
    </section>
  );
}

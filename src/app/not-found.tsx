import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function NotFound() {
  return (
    <main className="auth-card">
      <div className="panel" style={{ width: 'min(440px, 100%)', alignItems: 'flex-start' }}>
        <span className="drop-icon" style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Icon name="image" size={24} />
        </span>
        <h1>Não achamos esta página</h1>
        <p className="sub">O kit pode ter sido apagado, ou o link está incompleto.</p>
        <Link className="btn" href="/">
          <Icon name="grid" size={16} /> Voltar para Meus kits
        </Link>
      </div>
    </main>
  );
}

/** Esqueleto do Faturamento enquanto os pedidos chegam do Mercado Livre (90 dias pode levar alguns segundos). */
export default function Loading() {
  return (
    <main className="settings-page revenue" aria-busy="true" aria-label="Carregando o faturamento">
      <div className="skeleton" style={{ height: 36, width: 'min(240px, 70%)' }} />
      <div className="skeleton" style={{ height: 40, width: 300, borderRadius: 999 }} />
      <div className="kpis">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`skeleton${i === 0 ? ' kpi hero' : ''}`} style={{ height: 96, borderRadius: 22, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 280, borderRadius: 22 }} />
    </main>
  );
}

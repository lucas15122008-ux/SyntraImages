/** Esqueleto de Produtos enquanto os pedidos, anúncios e fretes chegam do Mercado Livre. */
export default function Loading() {
  return (
    <main className="settings-page revenue" aria-busy="true" aria-label="Carregando os produtos">
      <div className="skeleton" style={{ height: 36, width: 'min(240px, 70%)' }} />
      <div className="skeleton" style={{ height: 40, width: 300, borderRadius: 999 }} />
      <div className="kpis">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`skeleton${i === 0 ? ' kpi hero' : ''}`} style={{ height: 96, borderRadius: 22, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 420, borderRadius: 22 }} />
    </main>
  );
}

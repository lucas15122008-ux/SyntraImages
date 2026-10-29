/** Esqueleto do Resumo enquanto as vendas chegam do Mercado Livre. */
export default function Loading() {
  return (
    <main className="settings-page revenue overview" aria-busy="true" aria-label="Carregando o resumo">
      <div className="skeleton" style={{ height: 36, width: 'min(200px, 60%)' }} />
      <div className="kpis">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`skeleton${i === 0 ? ' kpi hero' : ''}`} style={{ height: 96, borderRadius: 22, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 160, borderRadius: 22 }} />
      <div className="kpis">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 96, borderRadius: 22, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
    </main>
  );
}

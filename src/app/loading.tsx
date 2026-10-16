/** Esqueleto enquanto a página carrega do servidor. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 'min(280px, 70%)' }} />
      <div className="kits">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 280, borderRadius: 22 }} />
        ))}
      </div>
    </div>
  );
}

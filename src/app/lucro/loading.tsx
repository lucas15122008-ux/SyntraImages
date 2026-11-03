/** Esqueleto do Lucro da Loja enquanto os pedidos e fretes chegam do Mercado Livre. */
export default function Loading() {
  return (
    <main className="settings-page revenue" aria-busy="true" aria-label="Carregando o lucro da loja">
      <div className="skeleton" style={{ height: 36, width: 'min(240px, 70%)' }} />
      <div className="skeleton" style={{ height: 40, width: 300, borderRadius: 999 }} />
      <div className="skeleton" style={{ height: 320, borderRadius: 22 }} />
      <div className="skeleton" style={{ height: 280, borderRadius: 22, animationDelay: '0.08s' }} />
    </main>
  );
}

'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { createApiKey, revokeApiKey, type ApiKeyRow } from '@/lib/api/key-actions';

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

export function ApiKeysPanel({ keys, origin }: { keys: ApiKeyRow[]; origin: string }) {
  const [name, setName] = useState('Claude');
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createApiKey(name);
      if (result.ok) setCreated(result.key);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a chave.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: ApiKeyRow) {
    if (!window.confirm(`Revogar a chave "${row.name}"? Quem usa essa chave para de funcionar na hora.`)) return;
    try {
      await revokeApiKey(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível revogar a chave.');
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(label);
  }

  const mcpUrl = created ? `${origin}/api/mcp?key=${created}` : null;
  const active = keys.filter((k) => !k.revoked_at);

  return (
    <>
      <div className="panel">
        <div className="head">
          <h2>Criar uma chave</h2>
        </div>
        <form onSubmit={submit} className="invite-form">
          <span className="input-icon">
            <Icon name="lock" size={16} />
            <input required maxLength={60} value={name} placeholder="Para que é a chave" aria-label="Nome da chave" onChange={(e) => setName(e.target.value)} />
          </span>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Criando…' : 'Criar chave'}
            {!busy && <Icon name="plus" size={16} />}
          </button>
        </form>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {created && mcpUrl && (
          <div className="api-key-created" role="status">
            <p className="status-ok">
              <Icon name="check" size={16} /> Chave criada. Copie agora: ela não aparece de novo.
            </p>
            <label className="field">
              <span className="label">Endereço do conector MCP (para o Claude)</span>
              <span className="api-key-copy">
                <code>{mcpUrl}</code>
                <button type="button" className="btn ghost" onClick={() => copy('mcp', mcpUrl)}>
                  {copied === 'mcp' ? 'Copiado' : 'Copiar'}
                </button>
              </span>
            </label>
            <label className="field">
              <span className="label">Só a chave (para a API)</span>
              <span className="api-key-copy">
                <code>{created}</code>
                <button type="button" className="btn ghost" onClick={() => copy('key', created)}>
                  {copied === 'key' ? 'Copiado' : 'Copiar'}
                </button>
              </span>
            </label>
            <p className="note">
              No Claude: Configurações → Conectores → Adicionar conector personalizado, e cole o endereço do conector. Quem tiver esse endereço consegue
              gerar fotos na sua conta, então trate como uma senha.
            </p>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="head">
          <h2>Chaves</h2>
        </div>
        {keys.length === 0 ? (
          <p className="note">Nenhuma chave ainda.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Começo da chave</th>
                  <th>Criada</th>
                  <th>Último uso</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td>
                      <code>{k.key_prefix}…</code>
                    </td>
                    <td>{date(k.created_at)}</td>
                    <td>{date(k.last_used_at)}</td>
                    <td>
                      {k.revoked_at ? (
                        <span className="pill bad">Revogada</span>
                      ) : (
                        <button type="button" className="btn ghost" onClick={() => revoke(k)}>
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {active.length > 0 && <p className="note">Uma chave revogada para de funcionar na hora e não volta.</p>}
      </div>
    </>
  );
}

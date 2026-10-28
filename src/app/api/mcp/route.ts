import { after, NextResponse } from 'next/server';
import { apiError, withApiKey } from '@/lib/api/http';
import { handleMcpMessage } from '@/lib/api/mcp';

// A geração do kit continua depois da resposta (cada foto leva de 12 a 35 s).
export const maxDuration = 300;

/**
 * Servidor MCP (Streamable HTTP, sem sessão). No Claude: Configurações → Conectores →
 * Adicionar conector personalizado, com a URL `https://<app>/api/mcp/syn_...`
 * (também aceita `?key=syn_...` e o cabeçalho `Authorization: Bearer`).
 */
export async function POST(req: Request) {
  return withApiKey(req, async ({ store, origin }) => {
    const body = await req.json().catch(() => undefined);
    if (body === undefined) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }, { status: 400 });
    const ctx = { store, origin, background: (task: () => Promise<void>) => after(task) };
    const messages = Array.isArray(body) ? body : [body];
    const replies = (await Promise.all(messages.map((m) => handleMcpMessage(m, ctx)))).filter((r) => r !== null);
    if (!replies.length) return new Response(null, { status: 202 });
    return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
  });
}

/**
 * Sem fluxo de eventos do servidor: o cliente MCP que pede um (Accept: text/event-stream)
 * recebe 405, como manda o protocolo. Aberto no navegador, serve para conferir a chave.
 */
export async function GET(req: Request) {
  if ((req.headers.get('accept') ?? '').includes('text/event-stream')) {
    return apiError('Use POST: este servidor MCP não abre fluxo de eventos.', 405);
  }
  return withApiKey(req, async () =>
    NextResponse.json({ ok: true, mensagem: 'Chave válida. Este endereço já pode ser usado como conector personalizado no Claude.' }),
  );
}

export async function DELETE() {
  return apiError('Este servidor MCP não guarda sessão.', 405);
}

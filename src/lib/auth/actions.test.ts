import { beforeEach, describe, expect, test, vi } from 'vitest';

const invite = vi.fn();
const requireAdmin = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  requireAdmin: () => requireAdmin(),
  getSupabaseAdmin: () => ({ auth: { admin: { inviteUserByEmail: invite } } }),
}));

import { inviteMember } from './actions';

beforeEach(() => {
  invite.mockReset().mockResolvedValue({ error: null });
  requireAdmin.mockReset().mockResolvedValue({ id: 'admin' });
});

describe('inviteMember', () => {
  test('convida o e-mail informado, sem espaços nem maiúsculas', async () => {
    await expect(inviteMember('  Ana@Loja.com.br ')).resolves.toEqual({ ok: true });
    expect(invite).toHaveBeenCalledWith('ana@loja.com.br');
  });

  test('quem não é admin não convida ninguém', async () => {
    requireAdmin.mockRejectedValue(new Error('Apenas o administrador pode fazer isso.'));
    await expect(inviteMember('ana@loja.com.br')).rejects.toThrow(/administrador/);
    expect(invite).not.toHaveBeenCalled();
  });

  test('e-mail inválido é recusado sem chamar o Supabase', async () => {
    await expect(inviteMember('isso-nao-e-email')).resolves.toEqual({ ok: false, error: 'Informe um e-mail válido.' });
    expect(invite).not.toHaveBeenCalled();
  });

  test('erro do Supabase volta como mensagem', async () => {
    invite.mockResolvedValue({ error: { message: 'boom' } });
    await expect(inviteMember('ana@loja.com.br')).resolves.toEqual({ ok: false, error: 'Não foi possível enviar o convite: boom' });
  });
});

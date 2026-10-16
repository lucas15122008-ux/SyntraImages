import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const notice = erro === 'convite' ? 'O link do convite é inválido ou já venceu. Peça um novo convite ao administrador.' : undefined;
  return <LoginForm notice={notice} />;
}

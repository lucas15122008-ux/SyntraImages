# SyntraImages

App web da equipe de e-commerce da JR Auto Peças: sobe uma foto de uma peça e recebe um kit de fotos para anúncio, geradas por IA (modelo `meta/muse-image` pelo OpenRouter), com revisão e refação foto a foto.

- **Spec:** `docs/superpowers/specs/2026-10-16-syntraimages-design.md`
- **O que o modelo faz e não faz:** `docs/superpowers/notes/model-capabilities.md` (aceita várias imagens de entrada, saída 1600×1600, 12 a 35 s e cerca de US$ 0,01 por foto)
- **Stack:** Next.js (App Router) + TypeScript, Supabase (login, banco com RLS, storage privado), Framer Motion, pnpm.

## Rodar no seu computador

```bash
pnpm install
cp .env.example .env.local   # preencha os valores (veja "Variáveis")
pnpm dev                     # http://localhost:3000
pnpm test                    # testes
pnpm build                   # build de produção
```

## Colocar no ar, passo a passo

### 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto (região mais próxima, por exemplo São Paulo).
2. Em **Project Settings → API**, copie a **Project URL**, a chave **anon public** e a chave **service_role** (esta é secreta).

### 2. Rodar as migrações

No **SQL Editor** do Supabase, rode, nesta ordem, o conteúdo de:

1. `supabase/migrations/0001_init.sql` (tabelas, regras de acesso RLS e os três buckets privados `originals`, `generated` e `store`)
2. `supabase/migrations/0002_generation_log.sql` (teto diário de gerações)
3. `supabase/migrations/0003_ml_connection.sql` (conexão com a conta do Mercado Livre)
4. `supabase/migrations/0004_revenue_goal.sql` (meta de faturamento do mês)
5. `supabase/migrations/0005_photo_switches.sql` (dia em que cada anúncio passou a usar as fotos do Syntra, usado no Foto x venda)
6. `supabase/migrations/0006_item_costs.sql` (custo de cada anúncio, usado no simulador de promoções)
7. `supabase/migrations/0007_custom_photos.sql` (fotos personalizadas)
8. `supabase/migrations/0008_api_keys.sql` (chaves da API de fotos e do conector MCP)

(Com a CLI do Supabase: `supabase link` e `supabase db push`.)

### 3. Desativar o cadastro aberto

Em **Authentication → Sign In / Providers → Email**, **desligue "Allow new users to sign up"**. Assim só entra quem for convidado. Os convites continuam funcionando porque usam a chave de serviço.

### 4. Configurar o e-mail de convite

O convite só funciona se o link do e-mail apontar para o app:

1. **Authentication → URL Configuration:** coloque o endereço do site (por exemplo `https://syntra.seudominio.com.br`) em **Site URL**.
2. **Authentication → Email Templates → Invite user:** troque o link por

   ```
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Aceitar convite</a>
   ```

3. O e-mail padrão do Supabase tem limite baixo de envios por hora. Para uso normal da equipe, configure um SMTP próprio em **Project Settings → Authentication → SMTP Settings**.

### 5. Criar o primeiro administrador (Lucas)

1. **Authentication → Users → Add user → Create new user:** informe e-mail e senha e marque "Auto Confirm User".
2. No **SQL Editor**, torne essa conta administradora:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'seu-email@exemplo.com');
   ```

Só o administrador sobe as artes da loja e convida pessoas.

### 6. Variáveis de ambiente

No computador, em `.env.local`; na hospedagem (por exemplo Vercel, em **Settings → Environment Variables**), as mesmas:

| Variável | O que é |
|---|---|
| `OPENROUTER_API_KEY` | Chave do OpenRouter. **Só no servidor**: nunca coloque `NEXT_PUBLIC_` nela. |
| `OPENROUTER_IMAGE_MODEL` | Modelo de imagem. Padrão `meta/muse-image`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon (pública) do Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço do Supabase. **Secreta, só no servidor.** |
| `DOWNLOAD_IMAGE_SIZE` / `DOWNLOAD_IMAGE_FORMAT` | Tamanho (600 a 3000 px) e formato (`jpg` ou `png`) de todas as fotos do zip, inclusive as artes da loja, que são ajustadas para quadrado sem corte e fundo branco. Padrão: 1600 e `jpg`. |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | App ID e Secret Key do app criado no DevCenter do Mercado Livre. **Só no servidor.** |
| `ML_TOKEN_KEY` | Chave que criptografa os tokens do ML no banco (mínimo 32 caracteres). Gere com `openssl rand -base64 48`. Se trocar, é preciso reconectar a conta. |
| `ML_REDIRECT_URI` | Opcional. A URL de retorno cadastrada no app; se vazia, usa `<domínio>/api/ml/callback`. |
| `DAILY_GENERATION_LIMIT` | Teto de fotos geradas por dia, somando a equipe toda (dia de Brasília). Padrão 350 (cerca de US$ 3,50). |

O arquivo `.env.local` não vai para o git. Se uma chave vazar, gere outra no painel do serviço.

### 7. Hospedar

1. Na Vercel, **Add New → Project**, escolha este repositório e preencha as variáveis acima.
2. A rota que gera cada foto pode levar de 12 a 35 s (e mais se houver repetição automática), então ela pede `maxDuration = 300`. Esse limite vale nos planos da Vercel com Fluid Compute (padrão atual); se a sua conta tiver um limite menor, as gerações podem ser cortadas e aparecem como "falhou" com botão de refazer.
3. A Vercel limita o corpo das requisições a cerca de 4,5 MB. Por isso o navegador reduz sozinho fotos acima de 3 MB (lado maior 2048 px) antes de subir.
4. Depois do primeiro deploy, volte ao passo 4 e confirme o **Site URL**.

### 8. Convidar a equipe

Entre como administrador, abra **Equipe** e informe o e-mail de cada pessoa. Ela recebe o convite, clica no link e cria a própria senha.

### 8b. Esqueci a senha / convite que não funcionou

Não há tela de recuperação de senha. Com a equipe pequena, o administrador resolve no painel do Supabase: **Authentication → Users**, abra a pessoa e use **Send password recovery** (ou apague a conta e convide de novo pela tela Equipe). Para o link de recuperação funcionar, em **Email Templates → Reset Password** use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.

### 9. Subir as artes da loja

Entre como administrador, abra **Fotos da loja** e envie as duas artes (JPEG, PNG ou WEBP, até 10 MB). Elas entram no fim dos kits que tiverem a loja ligada, sem custo de geração. Sem as duas artes, o app não deixa criar kit com loja ligada. Trocar uma arte não altera os kits já criados.

### 10. Conectar o Mercado Livre

1. No [DevCenter](https://developers.mercadolivre.com.br/devcenter), crie o app com a URL de retorno `https://<seu-domínio>/api/ml/callback` (a mesma do site na Vercel).
2. Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_TOKEN_KEY` na Vercel e faça um novo deploy.
3. Entre como administrador, abra **Mercado Livre** e clique em **Conectar Mercado Livre**. Os tokens ficam criptografados no Supabase, numa tabela que o navegador não consegue ler, e são renovados sozinhos.

### 11. API de fotos e conector do Claude (opcional)

Em **Gestão → API e MCP**, o administrador cria uma chave e copia o endereço do conector. No Claude: **Configurações → Conectores → Adicionar conector personalizado** e cole o endereço. Detalhes e exemplos em `docs/api.md`.

## Como usar

1. **Novo kit:** envie a foto da peça, o nome, o carro (modelo e ano) e escolha a quantidade (de 2 a 16, contando a capa e as fotos da loja), o tipo de cada foto do meio, capa comum ou com carro, referência extra e loja. É possível salvar a configuração como **modelo de kit** para a equipe (o carro não é salvo no modelo).
2. As fotos são geradas sozinhas, até 3 ao mesmo tempo. Na **revisão**, a foto original aparece ao lado de cada foto gerada. Fotos de tipos que a foto original provavelmente não mostra (ângulo de trás, peça instalada) saem com aviso; qualquer foto pode ganhar ou perder o aviso.
3. Refaça só as fotos ruins com **Refazer**: cada refação gera apenas aquela foto.
4. **Baixar kit** entrega um zip com `NN-nome.jpg` na ordem do kit, todas as fotos no mesmo tamanho e formato (veja `DOWNLOAD_IMAGE_SIZE`). Se uma refação falhar, o kit continua baixável com a foto anterior daquela posição.

## Se a geração falhar

- **Uma foto aparece como "falhou":** só aquela foto falhou. Veja a mensagem no card e clique em **Refazer**. Falhas passageiras do serviço (limite de requisições, instabilidade) já têm até 2 repetições automáticas antes de aparecer.
- **"Limite diário atingido":** o teto de `DAILY_GENERATION_LIMIT` foi alcançado. Ele zera à meia-noite (Brasília); o administrador pode aumentar a variável.
- **"O serviço de imagens recusou a chave" ou "Sem saldo":** confira a `OPENROUTER_API_KEY` e o saldo em openrouter.ai.
- **Uma foto fica "gerando" por mais de 5 minutos:** o servidor caiu no meio. A tela passa a mostrar "A geração travou" e libera o botão **Refazer**.
- **A peça saiu diferente da real:** use **Refazer**. O texto gravado na peça (marcas, códigos) costuma sair com letras levemente distorcidas; confira sempre contra a foto original.

## Teste real com a IA (opcional, tem custo)

```bash
LIVE_SMOKE=/caminho/da/foto.png pnpm test scripts/live-smoke.test.ts
```

Gera 3 fotos de verdade (capa com carro, lateral e mão) em `scripts/out/`, ao custo de cerca de US$ 0,03. `scripts/probe-model.ts` sonda o que o modelo aceita.

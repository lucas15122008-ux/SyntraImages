# SyntraImages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app multiusuário em que a equipe de e-commerce da JR Auto Peças sobe uma foto de peça e recebe um kit configurável de fotos geradas por IA, com revisão e refação por foto.

**Architecture:** Next.js (App Router, TypeScript) com a lógica do kit em módulos puros testáveis (`src/lib/kit`), um cliente do OpenRouter que só roda no servidor, e Supabase para login, banco (com RLS) e armazenamento privado de imagens. A tela fala com o servidor por server actions e rotas de API; as imagens voltam por URLs assinadas.

**Tech Stack:** Next.js, TypeScript, pnpm, Vitest, Supabase (Auth, Postgres, Storage), OpenRouter (modelo `meta/muse-image`), Framer Motion, jszip.

**Spec:** `docs/superpowers/specs/2026-10-16-syntraimages-design.md` (cópia de `/mnt/project-files/syntraimages/2026-10-16-syntraimages-design.md`). O construtor lê o documento inteiro; este plano só fixa as decisões de implementação.

## Global Constraints

- Interface e textos em português do Brasil; identificadores de código em inglês.
- Chave do OpenRouter apenas em variável de ambiente do servidor; nunca em código enviado ao navegador (nada com prefixo `NEXT_PUBLIC_`).
- Modelo de imagem: slug em `OPENROUTER_IMAGE_MODEL`, padrão `meta/muse-image`.
- Toda geração envia a foto original do produto como imagem de referência; nunca só texto.
- Fotos da loja são imagens fixas anexadas ao kit, sem chamada de IA e sem custo.
- A quantidade escolhida é o total do kit, contando a capa e as fotos da loja; as fotos da loja ficam sempre no final.
- Sem cadastro aberto: só contas convidadas pelo administrador (Lucas).
- Estética liquid glass azul-petróleo e verde-água, temas claro e escuro, com animações fluidas. Mockup aprovado: https://claude.ai/artifact/BpLZSxgEUdhEXxroMLxDgC
- Nada do kit de fotos antigo nem da automação do Mercado Livre do Lucas é reaproveitado.
- Escolhas de Lucas e do documento valem acima deste plano; ao divergir, pare e pergunte.

## Review Focus

Entradas e condições que o documento implica mas nenhuma tarefa testa por si só; cada uma tem teste na tarefa dona:

1. Foto de entrada inválida ou enorme (não é imagem, WEBP/HEIC, acima do limite de tamanho): erro claro, sem gerar nada (Task 7).
2. Falha ou tempo esgotado de uma geração no meio do kit: só aquela foto fica "falhou" e com botão de refazer; as outras seguem (Task 7).
3. Capa com carro sem modelo ou ano preenchidos: bloqueia a geração e aponta o campo (Task 3).
4. Quantidade mínima e máxima com a loja ligada e desligada; nunca menos que capa mais uma foto do meio (Task 3).
5. Clicar em "Refazer" repetidamente ou dois usuários refazendo a mesma foto: uma geração por vez por foto e teto diário de gerações (Task 7).
6. Nomes de arquivo com acento e posições no zip (Task 10).

---

### Task 1: Esqueleto do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/kit/.gitkeep`
- Create: `docs/superpowers/specs/2026-10-16-syntraimages-design.md` (copiar o documento aprovado)

**Interfaces:**
- Produces: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build` funcionando; variáveis documentadas em `.env.example`: `OPENROUTER_API_KEY`, `OPENROUTER_IMAGE_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DAILY_GENERATION_LIMIT`.

- [ ] **Step 1:** Em `/Users/lucas/Code/SyntraImages` (pasta vazia), rodar `git init` e criar o app Next.js com TypeScript, App Router, pnpm, sem Tailwind. Instalar `vitest`, `@testing-library/react`, `jsdom`, `@supabase/supabase-js`, `@supabase/ssr`, `framer-motion`, `jszip`.
- [ ] **Step 2:** Escrever `src/lib/kit/smoke.test.ts` com um `expect(1+1).toBe(2)`; rodar `pnpm test` e ver passar; apagar o teste.
- [ ] **Step 3:** Rodar `pnpm build`; esperado: build sem erros.
- [ ] **Step 4: Commit** `chore: scaffold Next.js app`.

### Task 2: Verificação do modelo no OpenRouter (portão)

**Files:**
- Create: `scripts/probe-model.ts`, `docs/superpowers/notes/model-capabilities.md`

**Interfaces:**
- Produces: nota com o slug confirmado, se aceita uma ou várias imagens de entrada, tamanhos de saída suportados, preço e tempo por imagem. Define a constante `MODEL_MAX_INPUT_IMAGES` usada nas Tasks 4 e 5.

- [ ] **Step 1:** Escrever `scripts/probe-model.ts` que chama a API do OpenRouter com `OPENROUTER_API_KEY`, primeiro lendo os metadados do modelo (modalidades, preço) e depois pedindo uma imagem quadrada a partir de uma foto de teste e, em outra chamada, a partir de duas fotos.
- [ ] **Step 2:** Rodar com uma foto real do Lucas; registrar tudo em `model-capabilities.md`, incluindo tempo medido por imagem.
- [ ] **Step 3: Portão.** Se o modelo aceitar apenas uma imagem de entrada, **pare e envie ao Lucas** as opções (combinar foto do produto e referência em uma só imagem antes de enviar, ou remover a referência extra) antes de seguir com as Tasks 4 e 5. Se aceitar várias, siga.
- [ ] **Step 4: Commit** `docs: record model capabilities`.

### Task 3: Planejamento do kit (lógica pura)

**Files:**
- Create: `src/lib/kit/types.ts`, `src/lib/kit/plan.ts`
- Test: `src/lib/kit/plan.test.ts`

**Interfaces:**
- Produces (em `types.ts`):
  - `type PhotoType = 'white_front' | 'white_side' | 'white_detail' | 'white_back' | 'white_on_box' | 'use_hand' | 'use_installed'`
  - `type KitConfig = { total: number; coverWithCar: boolean; car?: { model: string; year: string }; useExtraReference: boolean; includeStore: boolean; types: PhotoType[] }` (`types` são os tipos das fotos do meio, em ordem)
  - `type Slot = { position: number; kind: 'cover' | 'generated' | 'fixed'; type?: PhotoType; fixedIndex?: 0 | 1; warnMissingAngle: boolean }`
- Produces (em `plan.ts`): `MIN_TOTAL`, `MAX_TOTAL = 16`, `ANGLE_WARNING_TYPES: ReadonlySet<PhotoType>` (`white_back`, `use_installed`), `defaultMiddleTypes(count: number): PhotoType[]`, `validateConfig(c: KitConfig): string[]` (mensagens em português; vazio se válido), `planKit(c: KitConfig): Slot[]`.

- [ ] **Step 1: Testes** em `plan.test.ts`: com `total: 10, includeStore: true` o plano tem capa na posição 1, 7 fotos geradas nas posições 2 a 8 e fixas nas posições 9 e 10; com `includeStore: false` e `total: 10` há 9 fotos do meio; `white_back` e `use_installed` saem com `warnMissingAngle: true` e os demais com `false`; `validateConfig` rejeita `coverWithCar: true` sem modelo ou ano; rejeita `total` abaixo do mínimo (capa mais uma do meio, mais duas fixas se a loja estiver ligada) e acima de `MAX_TOTAL`; `defaultMiddleTypes(7)` devolve os 7 tipos sem repetir e, acima de 7, repete a partir do primeiro.
- [ ] **Step 2:** Rodar `pnpm test src/lib/kit/plan.test.ts`; esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `types.ts` e `plan.ts` com as assinaturas acima. Se `config.types` for menor que a quantidade de fotos do meio, completar com `defaultMiddleTypes`.
- [ ] **Step 4:** Rodar os testes; esperado: PASS.
- [ ] **Step 5: Commit** `feat: kit planning`.

### Task 4: Prompts de cada tipo de foto

**Files:**
- Create: `src/lib/kit/prompts.ts`
- Test: `src/lib/kit/prompts.test.ts`

**Interfaces:**
- Consumes: `Slot`, `PhotoType`, `KitConfig` (Task 3).
- Produces: `buildPrompt(slot: Slot, ctx: { productName: string; car?: { model: string; year: string }; hasExtraReference: boolean }): { text: string; imageRoles: Array<'product' | 'extra'> }`. Lança erro se `slot.kind === 'fixed'`.

- [ ] **Step 1: Testes:** todo prompt contém a instrução de fidelidade (a peça deve ser idêntica à da foto de referência, sem alterar formato, cor, furos, marcações ou logotipos); `imageRoles` começa sempre com `'product'` e inclui `'extra'` só quando `hasExtraReference` é verdadeiro; o prompt da capa com carro cita modelo e ano do carro; o da capa comum pede fundo branco sem carro; os de `use_hand` pedem mão humana com cinco dedos naturais; slot `fixed` lança erro.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar `buildPrompt` com um texto-base por `PhotoType` (fundo branco de estúdio, quadrado, peça centralizada, sem texto ou marca d'água) e a instrução de fidelidade fixa em todos. Se `MODEL_MAX_INPUT_IMAGES` for 1 (Task 2), `imageRoles` fica só com `'product'`.
- [ ] **Step 4:** Rodar; esperado: PASS.
- [ ] **Step 5: Commit** `feat: photo prompts`.

### Task 5: Cliente do OpenRouter

**Files:**
- Create: `src/lib/openrouter/client.ts`
- Test: `src/lib/openrouter/client.test.ts`

**Interfaces:**
- Produces: `generateImage(req: { prompt: string; images: Array<{ bytes: Uint8Array; mime: string }> }, deps?: { fetch?: typeof fetch; apiKey?: string; model?: string }): Promise<{ bytes: Uint8Array; mime: string }>`; classe `GenerationError extends Error { retryable: boolean; status?: number }`. Importa `server-only` para falhar se usado no navegador.

- [ ] **Step 1: Testes** com `fetch` falso: envia as imagens e o prompt no formato que a nota da Task 2 documenta; devolve os bytes da imagem; resposta 429 ou 5xx vira `GenerationError` com `retryable: true`; resposta 400 ou 401 vira `retryable: false`; resposta sem imagem vira `GenerationError` não repetível; o cabeçalho de autorização usa a chave recebida.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar com um repeat automático de até 2 tentativas só para erros repetíveis, com espera crescente.
- [ ] **Step 4:** Rodar; esperado: PASS.
- [ ] **Step 5: Commit** `feat: OpenRouter client`.

### Task 6: Banco, storage e login por convite

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/middleware.ts`, `src/app/login/page.tsx`
- Test: `supabase/tests/rls.test.sql` (ou teste equivalente com a CLI do Supabase)

**Interfaces:**
- Produces tabelas: `profiles(id, role 'admin'|'member')`, `kits(id, owner, product_name, car_model, car_year, config jsonb, original_path, extra_reference_path, created_at)`, `kit_photos(id, kit_id, position, kind, type, status 'pending'|'generating'|'done'|'failed', storage_path, warn_missing_angle, warn_dismissed, attempts, error)` com chave única `(kit_id, position)`, `kit_templates(id, name, config jsonb, created_by)`, `store_assets(slot 0|1 primary key, storage_path)`. Buckets privados: `originals`, `generated`, `store`.
- Produces: `getSupabaseServer()`, `getSupabaseBrowser()`, `requireUser()` e `requireAdmin()` (redirecionam ou lançam).

- [ ] **Step 1:** Escrever a migração com RLS: membros leem e alteram apenas kits e fotos da própria conta; `kit_templates` são visíveis a toda a equipe e editáveis por quem criou ou pelo admin; `store_assets` legíveis por todos e graváveis só pelo admin.
- [ ] **Step 2:** Teste de RLS: usuário A não lê kit do usuário B; membro não grava em `store_assets`.
- [ ] **Step 3:** Desativar cadastro aberto na configuração do projeto Supabase; o login é e-mail e senha em `/login`; o middleware leva visitantes sem sessão a `/login`.
- [ ] **Step 4:** Ação `inviteMember(email: string)` só para admin, usando a chave de serviço (`inviteUserByEmail`).
- [ ] **Step 5:** Rodar os testes de RLS e `pnpm build`; esperado: passam.
- [ ] **Step 6: Commit** `feat: schema, auth, invite-only`.

### Task 7: Geração e refação no servidor

**Files:**
- Create: `src/lib/kit/generate.ts`, `src/app/api/kits/[kitId]/photos/[position]/generate/route.ts`, `src/lib/kit/actions.ts`
- Test: `src/lib/kit/generate.test.ts`

**Interfaces:**
- Consumes: `planKit`, `buildPrompt`, `generateImage`, `GenerationError`, tabelas da Task 6.
- Produces: `createKit(input: { productName: string; config: KitConfig; original: File; extraReference?: File }): Promise<{ kitId: string }>` (valida config e imagem, grava originais, cria uma linha `kit_photos` por posição; fixas já nascem `done` apontando para `store_assets`); `generatePhoto(kitId: string, position: number): Promise<void>` (uma geração por vez por foto, respeita `DAILY_GENERATION_LIMIT`, grava em `generated`, atualiza `status`, `attempts` e `error`); rota `POST` que chama `generatePhoto`.

- [ ] **Step 1: Testes** com cliente do OpenRouter e Supabase falsos: `createKit` rejeita arquivo que não é imagem, formato fora de JPEG, PNG ou WEBP e arquivo acima de 10 MB, sem criar nada; uma foto que falha fica `failed` com `error` e as outras do kit continuam `pending` ou `done`; segunda chamada de `generatePhoto` para uma foto já `generating` não dispara outra geração; ao atingir o limite diário a função recusa com mensagem em português; foto de tipo com `warn_missing_angle` grava o aviso; refazer uma foto aumenta `attempts` e substitui o arquivo gerado.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar. Usar uma marca de estado em `kit_photos.status` com atualização condicional (`pending|failed|done` para `generating`) para garantir uma geração por vez. Se o tempo medido na Task 2 passar do limite da hospedagem, mover a geração para fila em segundo plano e fazer a tela consultar o `status`; caso contrário a rota gera de forma síncrona.
- [ ] **Step 4:** Rodar; esperado: PASS.
- [ ] **Step 5: Commit** `feat: kit creation and photo generation`.

### Task 8: Artes fixas da loja

**Files:**
- Create: `src/app/configuracoes/loja/page.tsx`, `src/lib/store/actions.ts`
- Test: `src/lib/store/actions.test.ts`

**Interfaces:**
- Produces: `saveStoreAsset(slot: 0 | 1, file: File): Promise<void>` (só admin), `getStoreAssets(): Promise<[StoreAsset | null, StoreAsset | null]>`. `createKit` (Task 7) usa `getStoreAssets` e recusa kit com loja ligada se alguma das duas artes não existir, apontando a tela de configurações.

- [ ] **Step 1: Testes:** membro comum não consegue gravar; admin grava e substitui; `createKit` com `includeStore: true` e arte faltando devolve erro com o texto "Suba as artes da loja em Configurações".
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar as ações e a tela de configurações (duas áreas de upload com prévia).
- [ ] **Step 4:** Rodar; esperado: PASS.
- [ ] **Step 5: Commit** `feat: store artwork settings`.

### Task 9: Modelos de kit

**Files:**
- Create: `src/lib/kit/templates.ts`
- Test: `src/lib/kit/templates.test.ts`

**Interfaces:**
- Consumes: `KitConfig`, `validateConfig`.
- Produces: `saveTemplate(name: string, config: KitConfig): Promise<string>`, `listTemplates(): Promise<Array<{ id: string; name: string; config: KitConfig }>>`, `deleteTemplate(id: string): Promise<void>`. O modelo salva a configuração sem os dados do carro (modelo e ano mudam a cada produto).

- [ ] **Step 1: Testes:** salvar e listar devolve a configuração sem `car`; nome vazio é recusado; config inválida é recusada; só o criador ou o admin apaga.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar; esperado: PASS.
- [ ] **Step 5: Commit** `feat: kit templates`.

### Task 10: Telas, estilo e download

**Files:**
- Create: `src/styles/glass.css`, `src/components/kit/BuildKit.tsx`, `src/components/kit/ReviewKit.tsx`, `src/components/kit/PhotoCard.tsx`, `src/app/kits/novo/page.tsx`, `src/app/kits/[kitId]/page.tsx`, `src/lib/kit/zip.ts`, `src/app/api/kits/[kitId]/download/route.ts`
- Test: `src/lib/kit/zip.test.ts`, `src/components/kit/BuildKit.test.tsx`

**Interfaces:**
- Consumes: tudo das Tasks 3 a 9.
- Produces: `buildZip(photos: Array<{ position: number; name: string; bytes: Uint8Array }>): Promise<Uint8Array>` com arquivos `NN-nome-sem-acentos.jpg` na ordem das posições.

- [ ] **Step 1: Testes de lógica:** `buildZip` ordena por posição, normaliza acentos e espaços no nome e mantém posições de dois dígitos; no `BuildKit`, o botão de menos não passa do mínimo e o de mais não passa de `MAX_TOTAL`, desligar a loja mantém o total e aumenta as fotos do meio, trocar para capa comum esconde os campos do carro, e o resumo diz quantas fotos serão geradas e quantas são fixas.
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar `glass.css` com os tokens e as regras do mockup aprovado (fundo com manchas azul-petróleo e verde-água, painéis de vidro fosco, tema claro e escuro por `prefers-color-scheme`), as duas telas (montar o kit com modelos de kit; revisar com a foto original ao lado de cada foto gerada, aviso nas fotos com `warn_missing_angle` e botões Refazer e Baixar kit) e a rota de download.
- [ ] **Step 4:** Rodar os testes; esperado: PASS. Subir `pnpm dev`, abrir as duas telas, comparar com o mockup nos temas claro e escuro e em largura de celular.
- [ ] **Step 5: Commit** `feat: build and review screens, zip download`.

### Task 11: Animações

**Files:**
- Modify: `src/components/kit/BuildKit.tsx`, `src/components/kit/ReviewKit.tsx`, `src/components/kit/PhotoCard.tsx`
- Create: `src/components/motion/presets.ts`

**Interfaces:**
- Produces: `presets.ts` exporta variantes do Framer Motion reutilizáveis (`screenTransition`, `photoArrive`, `listItem`), todas respeitando `prefers-reduced-motion`.

- [ ] **Step 1:** Aplicar transição suave entre as duas telas, entrada animada de cada foto quando ela passa a `done` e reordenação suave da lista de fotos ao mudar a quantidade.
- [ ] **Step 2:** Verificar manualmente no navegador, com e sem movimento reduzido, que nada pisca nem desloca o layout.
- [ ] **Step 3: Commit** `feat: motion polish`.

### Task 12: Implantação e passagem

**Files:**
- Create: `README.md`
- Modify: `.env.example`

- [ ] **Step 1:** Documentar no `README.md` em português: criar o projeto Supabase, rodar as migrações, desativar cadastro aberto, criar o primeiro admin, preencher as variáveis, convidar a equipe, subir as artes da loja e o que fazer se a geração falhar.
- [ ] **Step 2:** Hospedar na Vercel (ou equivalente) com as variáveis de ambiente do servidor; fazer um kit de ponta a ponta com uma foto real e uma refação.
- [ ] **Step 3:** Rodar `pnpm test` e `pnpm build`; esperado: tudo passa.
- [ ] **Step 4: Commit** `docs: README and deployment notes`.

---

## Auto-revisão

- **Cobertura do documento:** fluxo e kit padrão (Tasks 3, 7, 10), configurações (3, 10), modelos de kit (9), artes da loja (8), fidelidade e avisos (3, 4, 7, 10), login por convite e Supabase (6), chave só no servidor (5, Global Constraints), liquid glass e animações (10, 11), verificação do modelo (2), download (10).
- **Pontos do documento que ficam como decisão do construtor:** estrutura exata do banco, tipos propostos para as fotos do meio, formato do zip, geração síncrona ou em fila (depende do tempo medido na Task 2).

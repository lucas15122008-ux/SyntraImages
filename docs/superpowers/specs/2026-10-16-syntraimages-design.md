# SyntraImages: documento de design

Data: 2026-10-16. Autor da ideia: Lucas (JR Auto Peças). Idioma do produto e da interface: português do Brasil.

Convenção: tudo o que está em "Decidido pelo Lucas" foi dito por ele. Itens marcados **[escolha minha]** são decisões de quem escreveu este documento e podem ser trocadas.

## 1. Intenção

SyntraImages é um web app novo, totalmente separado de qualquer ferramenta anterior do Lucas (não reaproveita código, kit de fotos nem automação do Mercado Livre). Serve para a equipe de e-commerce da JR Auto Peças criar, a partir de **uma única foto** de uma peça automotiva (geralmente tirada do site do fornecedor ou do Google), um **kit de fotos** pronto para anúncios de marketplace, todas geradas por IA, com foco em fotos de e-commerce.

Por que existe: hoje cada produto exige cerca de 10 fotos (fundo branco, fotos de uso, capa com carro, fotos da loja) e o Lucas quer automatizar isso mantendo controle sobre quantidade e tipo de cada foto.

## 2. Usuários e contexto

- Usuários: a equipe de e-commerce do Lucas (pessoas de confiança, não clientes externos). Precisam de login.
- O Lucas paga a geração (OpenRouter). Ninguém da equipe precisa de chave própria.
- Entrada típica: uma foto de fornecedor ou do Google, resolução e qualidade variáveis, podendo ter fundo sujo ou marca d'água.

## 3. O que o produto faz (decidido pelo Lucas)

1. O usuário sobe uma foto do produto.
2. Informa o modelo e o ano de um carro compatível (digitados, não descobertos automaticamente).
3. Escolhe a configuração do kit. O app já propõe uma mistura de tipos de foto, e o usuário ajusta.
4. O app gera as fotos com o modelo de imagem **Muse Image 1.0**, acessado pela **API do OpenRouter**.
5. O usuário revisa as fotos e refaz **só as que ficaram ruins**, sem regerar o kit inteiro.
6. O usuário baixa o kit pronto.

### Kit padrão (o que o Lucas faz hoje, 10 fotos)

| Posição | Conteúdo |
|---|---|
| 1 | Capa: a peça junto com um carro compatível (modelo e ano informados) |
| 2 a 8 | A peça em ângulos, enquadramentos e cenas de uso diferentes. Maioria com fundo branco; algumas com fundo de uso (mecânico usando ou segurando a peça, gerado por IA) |
| 9 e 10 | Informações da loja no Mercado Livre |

As 10 fotos são só o padrão do Lucas. **A quantidade é escolhida a cada produto.**

### Configurável por kit

- Quantidade total de fotos.
- Tipo de cada foto do meio (ângulo, detalhe, fundo branco, cena de uso etc.).
- Capa personalizada (peça com carro) ou comum (sem carro).
- Usar ou não uma imagem de referência.
- Incluir ou não as fotos da loja.
- Salvar a configuração como **modelo de kit** reutilizável pela equipe (confirmado pelo Lucas: sim).

### Fotos da loja

São sempre a mesma arte, por isso são **imagens fixas** guardadas uma vez e anexadas ao kit, sem passar pela IA e sem custo de geração (ideia do Lucas para economizar na API). O usuário liga ou desliga no kit. O Lucas sobe as duas artes uma vez.

### Fidelidade da peça (principal critério de sucesso)

O maior motivo para o Lucas abandonar a ferramenta seria a peça sair diferente da real repetidamente. Portanto:

- Toda geração recebe a foto original do produto como referência de imagem, nunca apenas texto.
- Na revisão, a foto original aparece ao lado de cada foto gerada, para conferência rápida.
- Quando um ângulo pedido não aparece na foto original, o app **gera mesmo assim** e **marca a foto com um aviso**, deixando o Lucas decidir se mantém ou refaz (decisão do Lucas).
- Problemas já vistos pelo Lucas: mãos deformadas ou com dedos a mais em fotos de uso. A revisão com "Refazer" por foto existe por causa disso.

### Aparência (decidido pelo Lucas)

Estilo **liquid glass**: painéis de vidro fosco sobre fundo azul-petróleo e verde-água, em tema claro e escuro. Animações fluidas (transições entre telas, chegada de cada foto gerada). Mockups aprovados como "muito funcionais": https://claude.ai/artifact/BpLZSxgEUdhEXxroMLxDgC com duas telas:

- **Montar o kit**: painel à esquerda (foto do produto, carro e ano, quantidade com botões de mais e menos, capa comum ou com carro, referência, fotos da loja) e, à direita, a lista de fotos propostas, cada uma com seletor de tipo e indicação "IA" ou "sem custo". Resumo embaixo: quantas serão geradas e quantas são fixas.
- **Revisar fotos**: grade com o kit gerado, aviso destacado numa foto problemática, botão "Refazer" por foto, botão "Baixar kit".

## 4. Objetivos

- Gerar um kit completo de uma única foto de entrada, com a configuração mais comum já preenchida.
- Controle fino: quantidade, tipos, capa, referência, loja.
- Refazer individualmente sem custo de regerar tudo.
- Equipe usando com login, sem expor a chave do OpenRouter.
- Poupar custo: fotos da loja fixas, refação só do que precisa.

## 5. Fora do escopo (não-objetivos)

- Não reaproveita nada do kit de fotos nem da automação do Mercado Livre do Lucas.
- Não publica nem troca fotos em anúncios do Mercado Livre nesta versão.
- Não descobre sozinho qual carro é compatível: o usuário digita.
- Não é um serviço público para outros vendedores: só a equipe do Lucas.
- Não há edição manual de imagem (pincel, recorte) nesta versão.

## 6. Anti-objetivos (falha mesmo que "funcione")

- A peça gerada diferir da real de forma recorrente.
- Regerar o kit inteiro para consertar uma foto.
- A chave do OpenRouter chegar ao navegador.

## 7. Restrições

- Modelo de imagem: Muse Image 1.0 via OpenRouter (escolha do Lucas, já testado por ele com uma foto, resultado bom).
- Armazenamento das fotos no Supabase (escolha do Lucas).
- O Lucas paga o OpenRouter.
- O site deve ter animações.
- Uso em português do Brasil.

## 8. Escolhas técnicas **[escolha minha]**

O Lucas entregou linguagem e framework ao construtor. Proposta, trocável:

- Next.js com TypeScript.
- Supabase para login (e-mail e senha, só contas criadas ou convidadas pelo Lucas), banco (kits, modelos de kit, histórico de gerações) e armazenamento de imagens.
- Chamadas ao OpenRouter apenas no servidor.
- Framer Motion para animações; estilos em CSS próprio para o liquid glass.
- Hospedagem simples, por exemplo Vercel. A pasta de trabalho do Lucas no Mac é `/Users/lucas/Code/SyntraImages` (Node 24 e pnpm instalados; hoje vazia e sem git).

## 9. Deixado ao construtor

- Prompts de cada tipo de foto e como montar a imagem de referência junto com a foto original.
- Estrutura do banco, pastas do storage e regras de acesso.
- Forma de impedir cadastro aberto (convite ou lista de e-mails permitidos).
- Como limitar gasto (por exemplo teto de gerações por dia) se o construtor julgar necessário.
- Formato do download (zip com JPEG ou PNG, nomes de arquivo, resolução). Marketplaces costumam pedir imagens quadradas de alta resolução; o construtor escolhe um padrão sensato e o expõe como configuração.
- Ordem exata dos tipos propostos para as fotos do meio (a lista do mockup é ilustrativa).

## 10. Decisões menores tomadas na revisão **[escolha minha]**

- **Aviso de ângulo ausente:** regra fixa por tipo de foto, sem segunda chamada de IA. Cada tipo de foto tem uma marca "mostra lado que a foto original provavelmente não tem" (por exemplo "ângulo de trás" e "peça instalada no carro"); essas saem com o aviso. O usuário também pode marcar ou desmarcar o aviso em qualquer foto. Uma análise automática com modelo de visão fica para uma versão futura, pois adiciona custo e outro ponto de falha.
- **Artes fixas da loja:** o Lucas (papel de administrador) sobe as duas artes dentro do app, em uma tela de configurações da loja.
- **Contagem:** a quantidade escolhida é o total, contando a capa e as fotos da loja. Com a loja desligada, a quantidade continua sendo o total e as fotos do meio aumentam para compensar. As fotos da loja sempre ficam no final.

## 11. Respostas do Lucas e verificação pendente

1. **Imagem de referência (decidido pelo Lucas):** é uma segunda imagem opcional, enviada além da foto do produto (por exemplo de estilo, cena ou carro). A foto original do produto sempre vai como referência; esta opção é adicional.
2. **Modelo:** o Lucas informou o slug `meta/muse-image` no OpenRouter. Ele não sabe se aceita mais de uma imagem de entrada. **O construtor deve confirmar, antes de planejar**, se o modelo aceita várias imagens de entrada, se gera imagens quadradas em boa resolução, e preço e tempo por imagem. Se aceitar só uma imagem, a imagem de referência extra e a capa com peça e carro podem exigir outro desenho (por exemplo combinar as imagens antes de enviar) e isso deve voltar ao Lucas.

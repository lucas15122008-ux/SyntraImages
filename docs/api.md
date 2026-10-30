# API de fotos e conector MCP

Só a parte de fotos do Syntra: criar um kit a partir de uma foto da peça, acompanhar a geração, ver e refazer fotos. Os kits criados pela API aparecem em **Meus kits** de quem criou a chave, para revisar e baixar o zip no app, e contam no mesmo limite diário de gerações da equipe (`DAILY_GENERATION_LIMIT`, padrão 350).

## Chave de acesso

O administrador cria a chave em **Gestão → API e MCP**. Ela aparece uma única vez; no banco fica só o hash. Revogar desliga na hora.

Mande a chave de um destes jeitos:

- `Authorization: Bearer syn_...` (o recomendado)
- `X-API-Key: syn_...`
- no endereço do MCP: `/api/mcp/syn_...` (é o que o conector do Claude usa, porque ele não manda cabeçalhos)
- `?key=syn_...` na URL (o formato antigo; continua valendo)

## Conector MCP (Claude)

Endereço: `https://<seu-app>/api/mcp/syn_...`

Para conferir a chave, abra esse endereço no navegador: com a chave certa aparece "Chave válida"; com a chave errada ou revogada, um erro.

Se o Claude mostrar "Não foi possível registrar no serviço de login" ou pedir OAuth Client ID, a chave do endereço está errada, cortada ou revogada: o Syntra não usa OAuth. Deixe o OAuth Client ID vazio.

No Claude (web ou app): **Configurações → Conectores → Adicionar conector personalizado**, cole o endereço e salve. No Claude Code: `claude mcp add --transport http syntra https://<seu-app>/api/mcp --header "Authorization: Bearer syn_..."`.

Ferramentas:

| Ferramenta | O que faz |
|---|---|
| `criar_kit_de_fotos` | Cria o kit e começa a gerar. Responde na hora com o id. |
| `ver_kit` | Situação de cada foto, links de 1 hora e as fotos prontas como imagens (miniaturas de 512 px), para o Claude conferir a fidelidade. |
| `refazer_fotos` | Gera de novo as que falharam, ou as posições pedidas. |
| `listar_kits` | Kits recentes da conta. |
| `tipos_de_foto` | Tipos prontos, padrões e limites. |

Exemplo de pedido ao Claude: "Cria um kit de fotos da Bomba de óleo Gol 1.0 com esta foto <link>, capa com Gol G5 2012."

## API REST

Base: `https://<seu-app>/api/v1`. Respostas em JSON; erro vem como `{"erro": "..."}` com 400 (pedido errado), 401 (chave), 404 (kit não existe ou é de outra conta), 429 (limite diário) ou 500.

### Criar kit: `POST /kits`

```bash
curl -X POST https://<seu-app>/api/v1/kits \
  -H "Authorization: Bearer $SYNTRA_KEY" -H "Content-Type: application/json" \
  -d '{
    "produto": "Bomba de óleo Gol 1.0",
    "foto_url": "https://exemplo.com/bomba.jpg",
    "carro": { "modelo": "Gol G5", "ano": "2012" },
    "total": 10,
    "tipos": ["white_front", "white_side", "use_hand", { "nome": "Bancada", "descricao": "a peça sobre uma bancada de oficina" }]
  }'
```

| Campo | Obrigatório | Padrão | O que é |
|---|---|---|---|
| `produto` | sim | | Nome do produto. |
| `foto_url` ou `foto_base64` | sim | | A foto da peça (JPEG, PNG ou WEBP, até 10 MB). Link precisa ser público. |
| `referencia_url` ou `referencia_base64` | não | | Segunda imagem de referência da mesma peça. |
| `carro` | não | capa sem carro | `{ "modelo", "ano" }` para a capa com o carro compatível. |
| `total` | não | 10 | Total do kit, contando capa e as 2 artes da loja (mínimo 4 com loja, 2 sem; máximo 16). |
| `fotos_da_loja` | não | `true` | Coloca as artes fixas da loja no fim. |
| `tipos` | não | mistura sugerida | Fotos entre a capa e as da loja, em ordem: um tipo pronto (`GET /tipos`) ou `{ "nome", "descricao" }` para uma cena livre. Faltando itens, o resto é completado com a mistura padrão. |

Também aceita formulário (`multipart/form-data`) com o arquivo em `foto` (e `referencia`) e o resto em JSON no campo `dados`:

```bash
curl -X POST https://<seu-app>/api/v1/kits -H "Authorization: Bearer $SYNTRA_KEY" \
  -F foto=@bomba.jpg -F 'dados={"produto": "Bomba de óleo Gol 1.0"}'
```

Responde `202` com a situação do kit (veja abaixo). As fotos ficam prontas em cerca de 1 minuto.

### Ver kit: `GET /kits/{id}`

```json
{
  "id": "…", "produto": "Bomba de óleo Gol 1.0", "status": "gerando",
  "prontas": 3, "total": 10, "link_no_app": "https://<seu-app>/kits/…",
  "fotos": [
    { "posicao": 1, "tipo": "capa", "nome": "Capa", "status": "pronta", "url": "https://…", "erro": null, "aviso_angulo": false, "tentativas": 1 }
  ]
}
```

`status` do kit: `gerando`, `pronto`, `com_falhas` (alguma foto falhou: use `/gerar`) ou `parado` (o servidor parou no meio: use `/gerar` para retomar). Cada foto: `pendente`, `gerando`, `pronta` ou `falhou`. Os links valem 1 hora; peça de novo para links novos. `aviso_angulo` marca fotos de um ângulo que a foto original talvez não mostre.

### Gerar de novo: `POST /kits/{id}/gerar`

Sem corpo, tenta de novo as fotos pendentes ou com falha. Com `{"posicoes": [2, 5]}`, refaz essas, mesmo que estejam prontas. As artes da loja não são geradas.

### Outros

- `GET /kits?limite=10`: kits recentes.
- `GET /tipos`: tipos de foto prontos, padrões e limites.

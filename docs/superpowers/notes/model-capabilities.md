# Capacidades do modelo de imagem (Task 2)

Medido em 2026-10-16 com `scripts/probe-model.ts` e uma foto real (bomba de óleo, PNG 1200×1200 com fundo branco e sombra). Slug informado pelo Lucas: `meta/muse-image`.

## Resultado do portão

**O modelo aceita várias imagens de entrada.** Testado com 1, 2 (peça + logotipo, imagens diferentes) e 4 imagens: todas devolveram HTTP 200. Com peça + logotipo, a segunda imagem foi de fato usada (a placa ao fundo saiu com o logotipo da JR). Não foi encontrado o limite máximo; 4 é o maior valor testado. O app só precisa de 2 (foto do produto + referência extra).

Portanto o desenho do plano segue como está: sem combinar imagens antes de enviar. **`MODEL_MAX_INPUT_IMAGES = 4`** (valor comprovado; o app envia no máximo 2).

## Endpoint e formato (diferente do que o plano supunha)

O modelo **não** funciona em `/chat/completions` (HTTP 404: "is an image generation model … Use the /api/v1/images endpoint"). O correto é:

`POST https://openrouter.ai/api/v1/images` com `Authorization: Bearer <chave>`:

```json
{
  "model": "meta/muse-image",
  "prompt": "…",
  "n": 1,
  "aspect_ratio": "1:1",
  "output_format": "jpeg",
  "input_references": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,…" } }
  ]
}
```

Resposta: `{ "created": …, "data": [ { "b64_json": "…", "media_type": "image/jpeg" } ], "usage": { "cost": 0.01, … } }`.

- `input_references`: a primeira é sempre a foto do produto; a segunda, a referência opcional. Aceita data URL em base64.
- `GET /api/v1/images/models` lista o modelo com `input_modalities: ["text","image"]`, `output_modalities: ["image"]`. `supported_parameters` vem vazio e `endpoints` vem vazio (sem preço publicado nessa rota).
- Erros vêm como `{ "error": { "message", "code" } }` com o status HTTP correspondente.

## Saída

| Item | Resultado |
|---|---|
| Tamanho | **1600×1600** (quadrado) em todos os testes, com `aspect_ratio: "1:1"` ou sem ele |
| `size: "2048x2048"` | aceito, mas a saída continuou 1600×1600 (parâmetro sem efeito) |
| Formato padrão | `image/webp` |
| `output_format: "jpeg"` | funciona (`image/jpeg`, 1600×1600) — **o app pede JPEG direto** |
| Fidelidade (1 imagem) | muito boa: formato, furos e posição preservados; o texto gravado na peça saiu legível mas com letras levemente distorcidas (ex.: marca em relevo) — revisar sempre |

## Preço e tempo

| Chamada | Tempo | Custo (`usage.cost`) |
|---|---|---|
| 1 imagem de entrada, 1:1 | 15,3 s | US$ 0,01 |
| 1 imagem, sem parâmetros | 12,6 s | US$ 0,01 |
| 2 imagens (mesma foto) | 27,7 s | US$ 0,01 |
| 2 imagens (peça + logotipo) | 18,2 s | US$ 0,01 |
| 4 imagens | 29,8 s | US$ 0,01 |
| 1 imagem, JPEG | 21,2 s | US$ 0,01 |
| 1 imagem, `size` explícito | 34,8 s | US$ 0,01 |

Tempo típico **12–35 s por imagem**; custo reportado **US$ 0,01 por imagem** (o campo vem arredondado a 2 casas; o valor real pode ser menor). Um kit de 10 fotos com 7 a 9 gerações custa em torno de US$ 0,08 a 0,10.

## Consequências para o plano

- Task 4: `imageRoles` pode incluir `'extra'` (o modelo aceita 2+ imagens).
- Task 5: usar `/api/v1/images` e o formato acima, pedindo `output_format: "jpeg"` e `aspect_ratio: "1:1"`.
- Task 7: com 12–35 s por imagem, **a geração é síncrona, uma foto por requisição** (a tela dispara uma chamada por foto, em paralelo limitado), com `maxDuration` da rota acima do pior caso medido. Sem fila em segundo plano. Se a hospedagem limitar abaixo de ~60 s, é preciso reavaliar.

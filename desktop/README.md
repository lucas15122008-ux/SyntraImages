# Syntra para Windows e Mac

App de desktop que abre o Syntra (https://syntraimages.vercel.app) numa janela
própria, com ícone e instalador. Feito com [Tauri 2](https://tauri.app).

- **Atualiza sozinho:** o app não leva o código do site junto. Toda vez que
  abre, carrega a versão que está no ar. Só precisa reinstalar se mudar algo
  nesta pasta `desktop/` (ícone, nome, tamanho da janela).
- **Precisa de internet**, como o site.
- **Login:** fica salvo no app, igual no navegador. O login do app é separado
  do login do Chrome/Safari, então na primeira vez é preciso entrar de novo.
- **Links de fora** (Mercado Livre, anúncios de concorrentes) abrem no navegador
  padrão do computador.
- **Downloads** (kit em .zip) vão para a pasta Downloads, e o app mostra o
  arquivo no Finder / Explorador de Arquivos quando termina.
- **Arrastar fotos** de uma pasta para a área de foto funciona normalmente.

## Onde baixar os instaladores

O GitHub gera os instaladores sozinho (workflow `.github/workflows/desktop.yml`):

1. No GitHub, abra a aba **Actions** e clique na execução mais recente de
   **App desktop**.
2. Em **Artifacts**, baixe `syntra-windows` (tem o `.exe` e o `.msi`) ou
   `syntra-mac` (tem o `.dmg`, que funciona em Mac Intel e Apple Silicon).

Para publicar uma versão "oficial", crie uma tag `desktop-v0.1.0` (trocando o
número). O GitHub cria um rascunho de Release com os instaladores anexados.

## Instalar sem assinatura digital

Os instaladores ainda não são assinados (no Mac isso exige a conta Apple
Developer, US$ 99/ano; no Windows, um certificado de assinatura). Por isso o
sistema avisa na primeira vez. É só fazer uma vez por computador:

**Mac**
1. Abra o `.dmg` e arraste o **Syntra** para a pasta **Aplicativos**.
2. Abra o Syntra. Vai aparecer um aviso dizendo que a Apple não pôde verificar
   o app. Clique em **OK** (ou **Concluído**).
3. Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o fim e
   clique em **Abrir Mesmo Assim** ao lado da mensagem do Syntra. Confirme com
   a senha do Mac.

Se aparecer "o app está danificado", rode no Terminal:
`xattr -dr com.apple.quarantine /Applications/Syntra.app`

**Windows**
1. Rode o `Syntra_x.y.z_x64-setup.exe`.
2. Se aparecer "O Windows protegeu o computador", clique em **Mais
   informações** e depois em **Executar assim mesmo**.

O `.exe` instala só para o usuário atual e não pede senha de administrador. O
`.msi` instala para todos os usuários do computador.

## Mexer no app (para quem programa)

Precisa de Node 22 e Rust. No Mac, também das Command Line Tools
(`xcode-select --install`).

```bash
cd desktop
npm install
npm run dev     # abre o app apontando para o site no ar
npm run build   # gera o instalador do sistema atual
```

Para apontar para outro endereço (ex.: o Syntra rodando local), compile com
`SYNTRA_URL=http://localhost:3000 npm run dev`.

O ícone sai de `icon-source.png` (gerado a partir de `src/app/icon.svg`). Para
trocar, substitua o PNG (1024×1024) e rode `npm run icon`.

// App de desktop do Syntra: uma janela própria que abre o site do Syntra.
// O app não leva o código do site junto. Ele sempre carrega a versão que está
// no ar, então toda atualização do site já aparece aqui sem reinstalar nada.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::DownloadEvent;
use tauri::{Url, WebviewUrl, WebviewWindowBuilder};

/// Endereço do Syntra. Pode ser trocado na hora de compilar com SYNTRA_URL.
const APP_URL: &str = match option_env!("SYNTRA_URL") {
    Some(url) => url,
    None => "https://syntraimages.vercel.app",
};

/// Links que abrem dentro da janela. Qualquer outro (Mercado Livre, Google etc.)
/// abre no navegador padrão do computador.
fn opens_inside(url: &Url, app: &Url) -> bool {
    match url.scheme() {
        "about" | "blob" | "data" | "tauri" => true,
        "http" | "https" => url.host_str() == app.host_str(),
        _ => false,
    }
}

/// Faz `target="_blank"` e `window.open` navegarem na mesma janela. O filtro de
/// navegação decide depois se o link fica no app ou vai para o navegador.
const INIT_SCRIPT: &str = r#"
(function () {
  window.open = function (url) {
    if (url) window.location.href = new URL(url, window.location.href).href;
    return null;
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target]') : null;
    if (a && a.href && a.target !== '_self' && !a.hasAttribute('download')) {
      e.preventDefault();
      window.location.href = a.href;
    }
  }, true);
})();
"#;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_url: Url = APP_URL.parse().expect("SYNTRA_URL inválida");
            let nav_url = app_url.clone();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url))
                .title("Syntra")
                .inner_size(1360.0, 880.0)
                .min_inner_size(960.0, 640.0)
                .center()
                // Sem isso o Tauri "engole" fotos arrastadas para a janela e a
                // área de soltar foto do Syntra deixa de funcionar.
                .disable_drag_drop_handler()
                .initialization_script(INIT_SCRIPT)
                .on_navigation(move |url| {
                    if opens_inside(url, &nav_url) {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_download(move |_webview, event| {
                    match event {
                        // O WebView já escolhe a pasta Downloads e um nome livre
                        // ("kit.zip", "kit (1).zip"...), como o navegador faz.
                        DownloadEvent::Requested { .. } => {}
                        // Sem barra de downloads na janela, então mostra o
                        // arquivo pronto no Finder / Explorador de Arquivos.
                        DownloadEvent::Finished {
                            path: Some(path),
                            success: true,
                            ..
                        } => {
                            let _ = tauri_plugin_opener::reveal_item_in_dir(path);
                        }
                        _ => {}
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao abrir o Syntra");
}

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_KEY = 'syntra-theme';

/** Roda no <head>: lê a escolha salva e marca o <html> antes de pintar. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Armazenamento bloqueado (aba anônima): o tema vale só nesta visita.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

const THEME_EVENT = 'syntra-theme-change';

/** Avisa quando o tema muda pelo botão. */
export function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

export function readTheme(): ThemeChoice {
  try {
    const t = document.documentElement.dataset.theme ?? localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

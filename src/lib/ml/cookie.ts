/** Cookie httpOnly que guarda state + verificador PKCE entre a ida e a volta do login no ML. */
export const ML_OAUTH_COOKIE = 'ml_oauth';
export const ML_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/api/ml',
  maxAge: 600,
};
export const SETTINGS_PATH = '/configuracoes/mercado-livre';

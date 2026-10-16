/** Depois disso, uma foto que ficou em "generating" (servidor caiu) pode ser reassumida e refeita. */
export const STALE_GENERATION_MS = 5 * 60_000;

/** `status` e `generating_since` de uma foto: está presa em "generating" há tempo demais? */
export function isStaleGeneration(status: string, generatingSince: string | null, now: Date = new Date()): boolean {
  return status === 'generating' && !!generatingSince && now.getTime() - new Date(generatingSince).getTime() > STALE_GENERATION_MS;
}

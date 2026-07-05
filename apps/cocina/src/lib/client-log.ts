/** Logger best-effort de la app de cocina: consola + ring buffer en memoria
 *  (inspeccionable con `window.__cocinaLogs()` desde DevTools). Nunca lanza. */
const buffer: { at: string; scope: string; message: string }[] = [];
const MAX = 50;

export function logError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  try {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
    console.error(`[cocina:${scope}]`, message, context ?? '');
    buffer.push({ at: new Date().toISOString(), scope, message });
    if (buffer.length > MAX) buffer.shift();
    if (typeof window !== 'undefined') {
      (window as unknown as { __cocinaLogs?: () => typeof buffer }).__cocinaLogs = () => buffer;
    }
  } catch {
    // loggear nunca puede romper el flujo que reporta.
  }
}

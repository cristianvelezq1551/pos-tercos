/**
 * Logger central del POS. Los fallos "best-effort" (impresora, IndexedDB,
 * sockets, refresh de sesión) antes se tragaban con catch {} — sin rastro
 * para diagnosticar "se perdió una venta" o "no imprimió". Acá quedan:
 *  - en consola (visible en DevTools del mostrador), y
 *  - en un ring buffer persistido en localStorage (últimos 100), inspeccionable
 *    con `window.__posLogs()` desde la consola aunque la página haya recargado.
 * NUNCA lanza: loggear no puede romper el flujo que está reportando.
 */

const STORAGE_KEY = 'pos-tercos-client-logs';
const MAX_ENTRIES = 100;

export interface ClientLogEntry {
  at: string;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
}

export function logError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
    console.error(`[pos:${scope}]`, message, context ?? '', error instanceof Error ? error : '');
    if (typeof window === 'undefined') return;
    const entry: ClientLogEntry = {
      at: new Date().toISOString(),
      scope,
      message,
      ...(context ? { context } : {}),
    };
    const prev = readLogs();
    prev.push(entry);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(-MAX_ENTRIES)));
  } catch {
    // El logger jamás propaga.
  }
}

export function readLogs(): ClientLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as ClientLogEntry[]) : [];
  } catch {
    return [];
  }
}

// Acceso rápido para soporte: window.__posLogs() en la consola del navegador.
declare global {
  interface Window {
    __posLogs?: () => ClientLogEntry[];
  }
}
if (typeof window !== 'undefined') {
  window.__posLogs = readLogs;
}

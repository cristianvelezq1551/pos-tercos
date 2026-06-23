/**
 * Logger del sitio público. Anónimo → NO reporta al servidor (`/client-logs`
 * exige auth); deja rastro en consola + ring buffer en localStorage (últimos
 * 100), inspeccionable con `window.__webLogs()`. Reemplaza los catch {} mudos
 * (carrito, reconciliación, fetch de menú) para poder diagnosticar.
 * NUNCA lanza.
 */

const STORAGE_KEY = 'tercos-web-client-logs';
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
    console.error(`[web:${scope}]`, message, context ?? '', error instanceof Error ? error : '');
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

declare global {
  interface Window {
    __webLogs?: () => ClientLogEntry[];
  }
}
if (typeof window !== 'undefined') {
  window.__webLogs = readLogs;
}

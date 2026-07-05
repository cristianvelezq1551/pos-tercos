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

/** Reporte al servidor: máx 10/min por mostrador (telemetría, no firehose). */
const REPORT_WINDOW_MS = 60_000;
const REPORT_MAX_PER_WINDOW = 10;
let reportWindowStart = 0;
let reportCount = 0;

function reportToServer(entry: ClientLogEntry): void {
  const now = Date.now();
  if (now - reportWindowStart > REPORT_WINDOW_MS) {
    reportWindowStart = now;
    reportCount = 0;
  }
  if (reportCount >= REPORT_MAX_PER_WINDOW) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  reportCount += 1;
  // fetch directo (no logError) — un fallo acá NO debe re-reportarse (loop).
  void fetch('/api/client-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: entry.scope,
      message: entry.message.slice(0, 500),
      context: entry.context,
    }),
    credentials: 'include',
    keepalive: true,
  }).catch(() => undefined);
}

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
    reportToServer(entry);
  } catch {
    // El logger jamás propaga.
  }
}

/**
 * Migaja de diagnóstico (info, no error): queda en consola + en el ring buffer
 * (`window.__posLogs()`) para reconstruir una secuencia (ej. impresión paso a
 * paso) aunque haya salido bien. NO reporta al servidor (evita ruido/límite).
 */
export function logInfo(scope: string, message: string, context?: Record<string, unknown>): void {
  try {
    console.info(`[pos:${scope}]`, message, context ?? '');
    if (typeof window === 'undefined') return;
    const prev = readLogs();
    prev.push({ at: new Date().toISOString(), scope, message, ...(context ? { context } : {}) });
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

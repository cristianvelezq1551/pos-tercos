/**
 * Logger central del admin. Los fallos best-effort (fetch fallidos en catches,
 * parseos, acciones que se tragaban con catch {}) quedan acá:
 *  - en consola (DevTools), y
 *  - en un ring buffer en localStorage (últimos 100), inspeccionable con
 *    `window.__adminLogs()` aunque la página haya recargado, y
 *  - reportados al servidor (Railway logs) con throttle — el admin está
 *    autenticado, así que `/client-logs` (CashierAccess) lo acepta.
 * NUNCA lanza: loggear no puede romper el flujo que reporta.
 */

const STORAGE_KEY = 'tercos-admin-client-logs';
const MAX_ENTRIES = 100;
const REPORT_WINDOW_MS = 60_000;
const REPORT_MAX_PER_WINDOW = 10;
let reportWindowStart = 0;
let reportCount = 0;

export interface ClientLogEntry {
  at: string;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
}

function reportToServer(entry: ClientLogEntry): void {
  const now = Date.now();
  if (now - reportWindowStart > REPORT_WINDOW_MS) {
    reportWindowStart = now;
    reportCount = 0;
  }
  if (reportCount >= REPORT_MAX_PER_WINDOW) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  reportCount += 1;
  void fetch('/api/client-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: `admin:${entry.scope}`,
      message: entry.message.slice(0, 500),
      context: entry.context,
    }),
    credentials: 'include',
    keepalive: true,
  }).catch(() => undefined);
}

export function logError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
    console.error(`[admin:${scope}]`, message, context ?? '', error instanceof Error ? error : '');
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

/** Traza informativa (no error) al ring buffer + consola. Portado de apps/pos. */
export function logInfo(scope: string, message: string, context?: Record<string, unknown>): void {
  try {
    console.info(`[admin:${scope}]`, message, context ?? '');
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

declare global {
  interface Window {
    __adminLogs?: () => ClientLogEntry[];
  }
}
if (typeof window !== 'undefined') {
  window.__adminLogs = readLogs;
}

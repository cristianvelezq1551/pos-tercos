/**
 * Reporta al servidor los errores que revientan en el NAVEGADOR de las
 * pantallas sin sesión de caja (web del cliente, cocina, TV). Sin esto, un
 * checkout que se rompe en el teléfono de alguien no deja rastro en ninguna
 * parte: la persona se va y nadie se entera nunca.
 *
 * Es best-effort y silencioso por diseño: si el reporte falla, se ignora.
 * Avisar de un error no puede provocar otro.
 */

export type ReporterApp = 'web' | 'cocina' | 'display';

const ENDPOINT = '/api/client-logs/public';
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const MAX_MESSAGE = 300;

/**
 * Ruido del navegador que NO es un error de la aplicación y que, sin filtrar,
 * ahoga a los de verdad:
 *  - `ResizeObserver loop…`: aviso benigno que Chrome dispara al redimensionar.
 *  - `Script error.`: lo que ve la página cuando revienta un script de otro
 *    origen (una extensión). Llega sin archivo, sin línea y sin mensaje: no se
 *    puede investigar y casi nunca es nuestro.
 */
const RUIDO = [/^ResizeObserver loop/i, /^Script error\.?$/i];

/**
 * Decide si un mensaje se reporta: acota el ritmo y no repite el mismo texto
 * dentro de la ventana. Un error dentro de un render puede dispararse cientos
 * de veces por segundo; sin esto, el primer bug de una tarde llena el log y
 * tapa todo lo demás. Puro a propósito — la parte que se puede probar.
 */
export function crearFiltroDeErrores(
  { maxPorVentana = MAX_PER_WINDOW, ventanaMs = WINDOW_MS } = {},
): { permite: (mensaje: string, ahora: number) => boolean } {
  let inicioVentana = 0;
  let contador = 0;
  let vistos = new Set<string>();

  return {
    permite(mensaje: string, ahora: number): boolean {
      if (RUIDO.some((r) => r.test(mensaje))) return false;
      if (ahora - inicioVentana > ventanaMs) {
        inicioVentana = ahora;
        contador = 0;
        vistos = new Set();
      }
      if (vistos.has(mensaje)) return false;
      if (contador >= maxPorVentana) return false;
      vistos.add(mensaje);
      contador += 1;
      return true;
    },
  };
}

/**
 * Engancha `error` y `unhandledrejection`. Devuelve la función para
 * desengancharlos (la usa el `useEffect` que lo monta).
 */
export function instalarReporteDeErrores(app: ReporterApp): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const filtro = crearFiltroDeErrores();

  const reportar = (scope: string, mensaje: string): void => {
    const texto = mensaje.slice(0, MAX_MESSAGE);
    if (!filtro.permite(texto, Date.now())) return;
    if (navigator.onLine === false) return;
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app,
        scope,
        message: texto,
        path: window.location.pathname.slice(0, 120),
      }),
      // `keepalive` para que el reporte sobreviva si la persona cierra la
      // pestaña justo después del error, que es lo más probable.
      keepalive: true,
    }).catch(() => undefined);
  };

  const onError = (e: ErrorEvent): void => {
    const donde = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
    reportar('window.error', `${e.message}${donde}`);
  };
  const onRejection = (e: PromiseRejectionEvent): void => {
    const r: unknown = e.reason;
    reportar('unhandledrejection', r instanceof Error ? r.message : String(r));
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

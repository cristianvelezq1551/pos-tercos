/**
 * Traduce cualquier error a algo que la persona pueda leer y accionar.
 *
 * El backend ya responde en castellano —los services escriben sus mensajes
 * pensando en el cajero— así que lo normal es dejarlos pasar tal cual. Esto es
 * la red de seguridad para lo que se escapa: excepciones del framework, fallos
 * de red del navegador, errores de librerías. Sin ella llegan a la pantalla
 * cosas como `ThrottlerException: Too Many Requests`, que no le dice nada a
 * quien está tratando de entrar.
 *
 * La regla: si el texto parece escrito para un desarrollador, se reemplaza.
 * Ante la duda se deja pasar — un mensaje del negocio siempre explica mejor su
 * caso que cualquier frase genérica.
 */

/** Errores de red del navegador: el fetch ni siquiera llegó al servidor. */
const SIN_CONEXION = /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|err_connection/i;

/**
 * Huellas de que el texto NO fue escrito para un usuario final:
 * nombres de clase de excepción, códigos de error, rastros de stack.
 */
const TECNICO: readonly RegExp[] = [
  /\b\w*(Exception|Error)\b\s*:/, //  "ThrottlerException: ...", "TypeError: ..."
  /\bat\s+\w+\s*\(/, //             rastro de stack
  /\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE|ECONNRESET)\b/,
  /\bP\d{4}\b/, //                  códigos de Prisma (P2002, P2025…)
  /\b(undefined|null) is not|cannot read propert/i,
  /\b(validation failed|internal server error|bad request|forbidden|unauthorized|not found|too many requests)\b/i,
  /^\s*\{?\s*"?statusCode"?\s*:/, // un JSON crudo de la API
  /\bfetch\b.*\bfailed\b/i,
];

/** Mensajes por código HTTP, cuando el backend no mandó uno propio. */
const POR_ESTADO: Record<number, string> = {
  400: 'Revisa los datos: hay algo que no está bien.',
  401: 'Tu sesión venció. Vuelve a entrar.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  409: 'Alguien más cambió esto mientras lo editabas. Recarga y vuelve a intentar.',
  413: 'El archivo es demasiado grande.',
  422: 'Revisa los datos: hay algo que no está bien.',
  429: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.',
  503: 'El servicio no está disponible en este momento.',
};

const GENERICO = 'No se pudo completar la acción. Vuelve a intentar.';

function pareceTecnico(texto: string): boolean {
  return TECNICO.some((re) => re.test(texto));
}

/** Saca el texto de un error, venga como venga. */
function textoDe(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

/** Código HTTP del error, si lo trae (los clientes de API lo adjuntan). */
function estadoDe(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

export interface OpcionesMensajeError {
  /** Código HTTP, si el caller lo conoce y el error no lo trae. */
  status?: number;
  /** Qué mostrar cuando no hay nada mejor. */
  fallback?: string;
}

/**
 * Mensaje listo para poner en pantalla.
 *
 * @example
 *   mensajeDeError(err)                       // "Demasiados intentos seguidos…"
 *   mensajeDeError(err, { status: 403 })      // "No tienes permiso para hacer esto."
 */
export function mensajeDeError(err: unknown, opciones: OpcionesMensajeError = {}): string {
  const texto = textoDe(err).trim();
  const status = opciones.status ?? estadoDe(err);

  if (texto && SIN_CONEXION.test(texto)) {
    return 'Sin conexión. Revisa tu internet y vuelve a intentar.';
  }

  // Un mensaje del negocio pasa tal cual: explica mejor su caso.
  if (texto && !pareceTecnico(texto)) return texto;

  if (status && POR_ESTADO[status]) return POR_ESTADO[status]!;
  if (status && status >= 500) {
    return 'El sistema tuvo un problema. Vuelve a intentar; si sigue igual, avísale al dueño.';
  }
  return opciones.fallback ?? GENERICO;
}

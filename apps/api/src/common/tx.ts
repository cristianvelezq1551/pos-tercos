/**
 * Helpers ÚNICOS para transacciones SERIALIZABLE con reintento (C2 del
 * informe de calidad: había 5 copias divergentes del mismo predicado/loop en
 * sales, shifts, stock-counts, production y workers-weekly).
 *
 * Postgres aborta una tx Serializable en conflicto con SQLSTATE 40001
 * (serialization_failure); Prisma lo expone como `code='P2034'`. La tx hace
 * rollback COMPLETO, así que reintentar es seguro siempre que el trabajo
 * recompute su estado FRESCO adentro de la tx (todos los callers lo hacen).
 */

/** 40001/P2034 (+ deadlock, que también amerita reintento con estado fresco). */
export function isSerializationFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: string }).code;
  return code === 'P2034' || /could not serialize|deadlock detected/i.test(e.message);
}

/**
 * P2002 (unique constraint). Caso típico: el `upsert` de Prisma NO es atómico
 * cuando la fila no existe (hace select → create) — dos requests paralelos que
 * upsertean un singleton intentan crear a la vez y el perdedor muere con
 * P2002. El perdedor debe RELEER la fila ganadora, no fallar.
 */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && (e as { code?: string }).code === 'P2002';
}

/**
 * Cota alta por defecto: cada ronda de colisión deja pasar al menos una tx
 * (gana el índice único / la serialización), así que basta con ≥ ráfaga
 * concurrente esperable. En la realidad (1 cajero) las colisiones son 0-1.
 */
const DEFAULT_MAX_ATTEMPTS = 16;

/**
 * Espera antes de reintentar: exponencial con tope, más jitter.
 *
 * Sin esto los reintentos son un bucle cerrado: N transacciones que chocaron
 * sobre las mismas filas vuelven a entrar TODAS en el mismo instante y vuelven
 * a chocar. Con suficiente concurrencia sobre un punto caliente —ocho cobros
 * del mismo producto tocando las mismas filas de inventario— se agotan los 16
 * intentos y el cajero recibe un 500 en el camino del dinero. El jitter es lo
 * que rompe la sincronía: sin él los reintentos siguen alineados.
 */
function retryDelayMs(attempt: number): number {
  const base = Math.min(2 ** attempt, MAX_BACKOFF_MS);
  return base + Math.random() * base;
}

const MAX_BACKOFF_MS = 60;

/** Reintenta `work` mientras aborte por fallo de serialización. */
export async function runWithSerializationRetry<T>(
  work: () => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (e) {
      if (attempt >= maxAttempts || !isSerializationFailure(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }
}

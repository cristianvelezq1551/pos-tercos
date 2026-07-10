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

/** Reintenta `work` mientras aborte por fallo de serialización. */
export async function runWithSerializationRetry<T>(
  work: () => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (e) {
      if (attempt < maxAttempts && isSerializationFailure(e)) continue;
      throw e;
    }
  }
}

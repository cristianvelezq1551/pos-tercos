/** Mensaje legible de un error desconocido — el patrón repetido 20 veces. */
export function getErrorMessage(err: unknown, fallback = 'Error desconocido'): string {
  return err instanceof Error ? err.message : fallback;
}

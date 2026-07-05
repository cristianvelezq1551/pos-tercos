/** Mensaje legible de un error desconocido. */
export function getErrorMessage(err: unknown, fallback = 'Error desconocido'): string {
  return err instanceof Error ? err.message : fallback;
}

/** Mensaje legible de un error desconocido. Portado de apps/pos (Fase 2b). */
export function getErrorMessage(err: unknown, fallback = 'Error desconocido'): string {
  return err instanceof Error ? err.message : fallback;
}

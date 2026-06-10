import { ApiError } from './api-server';

/**
 * Traduce un error de fetch a un mensaje en español para el dueño/admin.
 * Reemplaza los técnicos "API 500" / "Network error" que no le dicen nada a
 * un usuario no técnico. El código real queda en consola para soporte.
 */
export function friendlyApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'No tienes permiso para ver esta sección.';
    if (err.status === 404) return 'No se encontró la información.';
    if (err.status >= 500) return 'El sistema no responde. Intenta de nuevo en un momento.';
    return 'No se pudo cargar la información.';
  }
  return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
}

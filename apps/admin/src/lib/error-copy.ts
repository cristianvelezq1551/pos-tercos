import { mensajeDeError } from '@pos-tercos/ui';
import { ApiError } from './api-server';

/**
 * Mensaje para las cargas del lado servidor (SSR) del admin.
 *
 * Delega en el helper compartido para no tener dos criterios distintos de qué
 * es "entendible". El `ApiError` trae el código HTTP, que es lo que necesita
 * el helper para elegir la frase cuando el backend no mandó una propia.
 */
export function friendlyApiError(err: unknown): string {
  const status = err instanceof ApiError ? err.status : undefined;
  return mensajeDeError(err, {
    status,
    fallback: 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.',
  });
}

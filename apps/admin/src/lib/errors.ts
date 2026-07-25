import { mensajeDeError } from '@pos-tercos/ui';

/**
 * Mensaje de error listo para mostrar.
 *
 * Delega en el helper compartido (`packages/ui/src/lib/error-message.ts`), que
 * deja pasar los mensajes del negocio —ya escritos en castellano— y reemplaza
 * los técnicos. Antes esto devolvía `err.message` crudo y llegaban a la
 * pantalla cosas como `ThrottlerException: Too Many Requests`.
 */
export function getErrorMessage(err: unknown, fallback = 'No se pudo completar la acción.'): string {
  return mensajeDeError(err, { fallback });
}

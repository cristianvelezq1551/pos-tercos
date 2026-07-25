import { mensajeDeError } from '@pos-tercos/ui';

/**
 * Mensaje de error listo para mostrarle al cliente.
 *
 * Delega en el helper compartido: los mensajes del negocio pasan tal cual y
 * los técnicos se reemplazan. Acá importa más que en el resto de las apps —
 * quien lo lee es un cliente, no alguien del equipo.
 */
export function getErrorMessage(err: unknown, fallback = 'No se pudo completar el pedido.'): string {
  return mensajeDeError(err, { fallback });
}

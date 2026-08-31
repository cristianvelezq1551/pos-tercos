import { SetMetadata } from '@nestjs/common';

export const ALLOW_UPLOAD_TICKET = 'allowUploadTicket';

/**
 * Marca una ruta como alcanzable con un permiso de subida (`scope: 'upload'`),
 * además de con la sesión normal.
 *
 * Se pone SOLO donde se sube un archivo grande. El permiso dura segundos y no
 * abre ninguna otra puerta: así el navegador puede saltarse el proxy de la app
 * —que corta el cuerpo cerca de 4,5 MB— sin que una credencial con acceso
 * completo quede dando vueltas en el JS de la página.
 */
export const AllowUploadTicket = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_UPLOAD_TICKET, true);

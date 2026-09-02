import type { ZodType } from 'zod';

/**
 * Sube o quita comprobantes de un pago. Las cuatro pantallas de pago
 * (factura, costo fijo, compromiso, abono de nómina) hablan igual con su
 * endpoint; solo cambia la ruta y lo que devuelve.
 *
 * Las imágenes llegan ya achicadas por `prepararFoto` (lo hace la galería antes
 * de llamar acá): comprimir dos veces solo perdería calidad.
 */
export async function subirComprobantes<T>(
  path: string,
  files: File[],
  schema: ZodType<T>,
): Promise<T> {
  const fd = new FormData();
  for (const f of files) fd.append('proofs', f);
  return enviar(path, { method: 'POST', body: fd }, schema);
}

export function quitarComprobante<T>(path: string, schema: ZodType<T>): Promise<T> {
  return enviar(path, { method: 'DELETE' }, schema);
}

async function enviar<T>(path: string, init: RequestInit, schema: ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return schema.parse((await res.json()) as unknown);
}

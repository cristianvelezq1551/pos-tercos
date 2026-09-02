import { z } from 'zod';

const RespuestaSchema = z.object({
  imageUrl: z.string(),
  key: z.string(),
});

/**
 * Sube una imagen y devuelve su URL. Vive en `lib/` porque la usan el catálogo
 * de productos y el de subproductos: el endpoint es el mismo (el bucket no
 * distingue para qué es la foto) y duplicar el fetch en dos features termina
 * en dos manejos de error distintos para la misma falla.
 */
export async function subirImagen(file: File): Promise<{ imageUrl: string; key: string }> {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/products/upload-image', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return RespuestaSchema.parse(await res.json());
}

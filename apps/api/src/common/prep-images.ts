import { PrepImageSchema, type PrepImage } from '@pos-tercos/types';
import { z } from 'zod';

const ListaSchema = z.array(PrepImageSchema);

/**
 * Lee las fotos de preparación que Prisma devuelve como JSON crudo.
 *
 * Una foto mal guardada no puede tumbar la ficha entera del producto: si el
 * contenido no valida se devuelve la lista vacía, que es lo mismo que "todavía
 * no le cargaron fotos" y deja la biblia usable.
 */
export function toPrepImages(raw: unknown): PrepImage[] {
  const parsed = ListaSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Normaliza lo que llega del formulario: el rótulo vacío se guarda como null. */
export function normalizePrepImages(
  input: ReadonlyArray<{ url: string; label?: string | null }>,
): PrepImage[] {
  return input.map((i) => ({ url: i.url, label: i.label?.trim() ? i.label.trim() : null }));
}

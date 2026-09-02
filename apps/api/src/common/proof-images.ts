import { BadRequestException } from '@nestjs/common';
import { MAX_PROOFS_POR_PAGO } from '@pos-tercos/types';

/**
 * Un pago puede tener VARIOS comprobantes. Por compatibilidad la primera
 * imagen sigue viviendo en la columna de siempre (`proof_image_key` /
 * `payment_proof_key`) y las demás en la columna nueva de extras: todo lo que
 * ya leía la columna vieja (hasProof, el endpoint del comprobante, tesorería)
 * sigue viendo exactamente lo mismo.
 *
 * La lista completa, en orden, es `[primary, ...extras]`.
 */

export { MAX_PROOFS_POR_PAGO };

export type ProofSlots = { primary: string | null; extras: string[] };

/** Lista completa en orden, sin huecos. */
export function proofKeys(primary: string | null, extras: string[]): string[] {
  return primary === null ? [...extras] : [primary, ...extras];
}

/** Cuántos comprobantes tiene el pago. */
export function proofCount(primary: string | null, extras: string[]): number {
  return proofKeys(primary, extras).length;
}

/** La key en esa posición, o null si el índice no existe. */
export function proofKeyAt(
  primary: string | null,
  extras: string[],
  index: number,
): string | null {
  return proofKeys(primary, extras)[index] ?? null;
}

/**
 * La primera imagen de un pago que EXIGE comprobante. La columna de esos pagos
 * es NOT NULL; escribir '' dejaría un soporte que no se puede abrir, así que
 * acá se rompe fuerte en vez de guardar una key vacía en silencio.
 */
export function primaryObligatoria(slots: ProofSlots): string {
  if (slots.primary === null) {
    throw new BadRequestException('Este pago necesita al menos un comprobante.');
  }
  return slots.primary;
}

/** Reparte una lista en (primera, resto) para persistirla en las dos columnas. */
export function toSlots(keys: string[]): ProofSlots {
  return { primary: keys[0] ?? null, extras: keys.slice(1) };
}

/**
 * Lanza si sumar `cuantas` se pasa del tope. Se llama ANTES de subir a storage:
 * dejar allí lo que después no cabe llena el bucket con basura.
 */
export function assertCabenProofs(
  primary: string | null,
  extras: string[],
  cuantas: number,
): void {
  const actuales = proofCount(primary, extras);
  if (actuales + cuantas > MAX_PROOFS_POR_PAGO) {
    throw new BadRequestException(
      `Un pago admite hasta ${MAX_PROOFS_POR_PAGO} comprobantes. Este ya tiene ${actuales}.`,
    );
  }
}

/** Agrega imágenes al final. */
export function appendProofs(
  primary: string | null,
  extras: string[],
  nuevas: string[],
): ProofSlots {
  assertCabenProofs(primary, extras, nuevas.length);
  return toSlots([...proofKeys(primary, extras), ...nuevas]);
}

/**
 * Quita el comprobante de esa posición y devuelve las columnas nuevas más la
 * key eliminada (para borrarla del storage). `minimo` protege a los pagos que
 * exigen comprobante: quitar el último los dejaría sin soporte.
 */
export function removeProofAt(
  primary: string | null,
  extras: string[],
  index: number,
  opts: { minimo: number },
): { slots: ProofSlots; removed: string } {
  const actuales = proofKeys(primary, extras);
  const removed = actuales[index];
  if (removed === undefined) {
    throw new BadRequestException('Ese comprobante ya no existe. Recarga la página.');
  }
  if (actuales.length - 1 < opts.minimo) {
    throw new BadRequestException(
      'Este pago necesita al menos un comprobante. Agrega otro antes de quitar este.',
    );
  }
  const quedan = actuales.filter((_, i) => i !== index);
  return { slots: toSlots(quedan), removed };
}

export type ProofUpload = { buffer: Buffer; mime: string; ext: string };

/**
 * Valida los archivos de un multipart de comprobantes. El tipo lo deciden
 * siempre los magic bytes: el nombre y el mime que declara el navegador los
 * escribe quien sube (§7.v48).
 */
export function parseProofUploads(
  files: Express.Multer.File[] | undefined,
  detect: (b: Buffer) => { mime: string; ext: string } | null,
): ProofUpload[] {
  const lista = parseProofUploadsOptional(files, detect);
  if (lista.length === 0) throw new BadRequestException('Falta el comprobante (imagen).');
  return lista;
}

/** Igual, pero acepta cero archivos (pagos donde el comprobante es opcional). */
export function parseProofUploadsOptional(
  files: Express.Multer.File[] | undefined,
  detect: (b: Buffer) => { mime: string; ext: string } | null,
): ProofUpload[] {
  return (files ?? []).map((f) => {
    const detected = detect(f.buffer);
    if (!detected) throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
    return { buffer: f.buffer, mime: detected.mime, ext: detected.ext };
  });
}

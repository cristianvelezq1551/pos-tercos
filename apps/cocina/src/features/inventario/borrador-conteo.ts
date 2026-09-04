/**
 * El conteo físico a medio hacer, guardado en el teléfono.
 *
 * Contar la bodega toma un rato y se hace caminando: basta un toque de más, un
 * bloqueo de pantalla o que el navegador recargue la pestaña para perderlo
 * todo. Pasó de verdad — el cocinero iba a punto de terminar y tuvo que
 * empezar de cero.
 *
 * Se guarda en `localStorage` y no en el servidor a propósito: un conteo a
 * medias no es un dato del negocio (nadie más lo mira, no ajusta nada hasta
 * que se envía) y guardarlo local funciona incluso sin señal, que es como está
 * media bodega.
 */

const CLAVE = 'tercos.cocina.conteo-borrador';

/** Pasadas 12 horas ya es de otra jornada: contar de nuevo es más seguro que
 *  arrastrar números viejos que nadie recuerda de dónde salieron. */
export const VIGENCIA_MS = 12 * 60 * 60 * 1000;

export interface BorradorConteo {
  /** stockableId → lo tecleado, tal cual (puede ser "6," a medio escribir). */
  valores: Record<string, string>;
  /** Cuándo se guardó, en milisegundos. */
  guardadoEn: number;
}

/** Cuántos ítems tienen algo escrito. Vacío = no hay nada que guardar. */
export function cuantosContados(valores: Record<string, string>): number {
  return Object.values(valores).filter((v) => v.trim() !== '').length;
}

/**
 * ¿Sirve este borrador? Descarta el vencido y el que quedó sin ningún dato
 * (guardar uno vacío ofrecería "retomar" algo que no existe).
 */
export function borradorUtilizable(b: BorradorConteo | null, ahora: number): boolean {
  if (!b) return false;
  if (cuantosContados(b.valores) === 0) return false;
  const edad = ahora - b.guardadoEn;
  // Una fecha futura (reloj del teléfono cambiado) no lo invalida: lo que se
  // tecleó sigue siendo lo que se contó.
  return edad < VIGENCIA_MS;
}

/**
 * Quita del borrador lo que ya no está en el catálogo. Entre que se empezó a
 * contar y se retomó, un insumo pudo desactivarse: enviarlo daría un error del
 * servidor que el cocinero no puede resolver.
 */
export function soloItemsVigentes(
  valores: Record<string, string>,
  idsVigentes: readonly string[],
): Record<string, string> {
  const vigentes = new Set(idsVigentes);
  return Object.fromEntries(Object.entries(valores).filter(([id]) => vigentes.has(id)));
}

export function leerBorrador(): BorradorConteo | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as unknown;
    if (typeof dato !== 'object' || dato === null) return null;
    const { valores, guardadoEn } = dato as Partial<BorradorConteo>;
    if (typeof valores !== 'object' || valores === null) return null;
    if (typeof guardadoEn !== 'number') return null;
    return { valores: valores as Record<string, string>, guardadoEn };
  } catch {
    // Un borrador ilegible no puede romper la pantalla de conteo.
    return null;
  }
}

export function guardarBorrador(valores: Record<string, string>): void {
  try {
    if (cuantosContados(valores) === 0) {
      localStorage.removeItem(CLAVE);
      return;
    }
    localStorage.setItem(CLAVE, JSON.stringify({ valores, guardadoEn: Date.now() }));
  } catch {
    // Sin espacio o en modo privado: se sigue contando, solo que sin red de
    // seguridad. Romper acá sería peor que no guardar.
  }
}

export function borrarBorrador(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}

/** "hace 5 minutos" / "hace 2 horas", para que se sepa si es de esta jornada. */
export function haceCuanto(guardadoEn: number, ahora: number): string {
  // Truncado y no redondeado: con `round`, 30 segundos ya decía "hace 1
  // minuto" y sonaba más viejo de lo que era.
  const minutos = Math.max(0, Math.floor((ahora - guardadoEn) / 60_000));
  if (minutos < 1) return 'hace un momento';
  if (minutos === 1) return 'hace 1 minuto';
  if (minutos < 60) return `hace ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
}

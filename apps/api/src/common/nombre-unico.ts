import { ConflictException } from '@nestjs/common';

/**
 * Dos items ACTIVOS con el mismo nombre son indistinguibles donde importa: en la
 * caja quedan dos fichas idénticas —el cajero toca una y descuenta el stock de la
 * otra—, el top de productos parte uno en dos filas que ninguna dice la verdad, y
 * el emparejamiento de facturas (que es por parecido de nombre) puede cargarle la
 * compra al gemelo que nadie vende.
 *
 * La garantía real es el índice único parcial de la DB (migración
 * `20260901000000_nombre_unico_por_activo`). Esto es la capa amable: chequea antes
 * para dar un mensaje que se entienda, y traduce el choque del índice cuando dos
 * peticiones simultáneas ganan la carrera.
 *
 * Se compara SIN distinguir mayúsculas y sobre el nombre ya recortado (los schemas
 * de Zod aplican `.trim()`): "Gaseosa", "gaseosa" y "Gaseosa " son el mismo nombre
 * para una persona, y es a la persona a la que hay que evitarle el duplicado.
 *
 * Solo entre los ACTIVOS: desactivar algo tiene que liberar su nombre, o renombrar
 * un producto viejo para volver a usar el nombre bueno sería imposible.
 */

/** Busca un item activo con ese nombre. Devuelve null si el nombre está libre. */
export type BuscarActivoPorNombre = (nombre: string) => Promise<{ id: string } | null>;

/** Cómo nombrar la cosa en el mensaje de error. */
export type TipoDeItem = 'producto' | 'insumo' | 'subproducto';

function mensaje(tipo: TipoDeItem, nombre: string): string {
  return `Ya tienes un ${tipo} activo que se llama "${nombre}". Ponle otro nombre, o desactiva el que ya existe si lo estás reemplazando.`;
}

/**
 * Falla si el nombre ya está tomado por OTRO item activo.
 * `idActual` exime al propio item, para que guardar sin cambiarle el nombre funcione.
 */
export async function assertNombreDisponible(
  buscar: BuscarActivoPorNombre,
  nombre: string,
  tipo: TipoDeItem,
  idActual?: string,
): Promise<void> {
  const existente = await buscar(nombre);
  if (existente && existente.id !== idActual) {
    throw new ConflictException(mensaje(tipo, nombre));
  }
}

/**
 * ¿El error es el índice único de nombre?
 *
 * Se reconoce por el `target` que reporta Prisma, para no confundirlo con OTRA
 * violación de unicidad de la misma tabla, que necesita su propio mensaje.
 *
 * ⚠️ Para un índice de EXPRESIÓN, Prisma no devuelve el nombre del índice sino la
 * expresión: `target: ["lower(btrim(name))"]` (verificado contra Postgres). Se
 * aceptan las dos formas porque cuál de las dos llega depende de la versión.
 */
function esChoqueDeNombre(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  const texto = (Array.isArray(target) ? target.join(',') : String(target ?? '')).toLowerCase();
  return texto.includes('btrim(name)') || texto.includes('nombre_activo');
}

/**
 * Envuelve el guardado para que la carrera perdida contra el índice salga como el
 * mismo 409 legible y no como un 500 (que además dispara la alerta de producción).
 */
export async function conNombreUnico<T>(
  tipo: TipoDeItem,
  nombre: string,
  guardar: () => Promise<T>,
): Promise<T> {
  try {
    return await guardar();
  } catch (error) {
    if (esChoqueDeNombre(error)) throw new ConflictException(mensaje(tipo, nombre));
    throw error;
  }
}

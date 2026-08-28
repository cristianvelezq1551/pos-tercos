/**
 * Reglas del domicilio de compra (el flete que cobra el proveedor por traer la
 * mercancía). Puras, sin IO.
 *
 * Viven en domain porque las usan el backend Y varias pantallas del admin: la
 * conciliación al confirmar una factura, el diálogo que corrige el flete
 * después, la tarjeta del mes y las tres tablas del reporte de compras. Con una
 * copia por archivo se separan al primer ajuste — es la misma lección del
 * prorrateo del envío (§7.v31).
 */

/**
 * Piso de la tolerancia en COP. Por debajo de esto el 1% no alcanza a cubrir el
 * redondeo de una factura chica.
 */
export const TOLERANCIA_TOTAL_PISO_COP = 1000;

/**
 * Cuánto puede diferir el total declarado de `items + flete`.
 *
 * La UI usa la MISMA función que el backend: si mostrara "cuadra" donde el
 * server rechaza, el operador no podría avanzar sin entender por qué; y al
 * revés, marcaría error donde el server acepta.
 */
export function toleranciaDelTotal(total: number): number {
  return Math.max(total * 0.01, TOLERANCIA_TOTAL_PISO_COP);
}

/** ¿El total declarado se explica con los ítems más el flete? */
export function totalCuadra(opts: {
  total: number;
  itemsSum: number;
  freight: number;
}): boolean {
  const delta = Math.abs(opts.total - (opts.itemsSum + opts.freight));
  return delta <= toleranciaDelTotal(opts.total);
}

/**
 * A partir de este peso sobre lo comprado, el domicilio deja de ser ruido y
 * conviene sentarse a negociar (envío gratis sobre un mínimo, juntar pedidos, o
 * ir a recoger). Es un umbral de CRITERIO, no una ley contable: mueve el color
 * de la pantalla, nunca un número.
 */
export const PCT_FLETE_ALTO = 0.05;

/** `null` cuando no se compró nada: sin denominador no hay porcentaje que juzgar. */
export function fleteEsAlto(freightPct: number | null): boolean {
  return freightPct !== null && freightPct >= PCT_FLETE_ALTO;
}

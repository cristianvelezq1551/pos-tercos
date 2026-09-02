/**
 * Cantidad, costo unitario y total de una línea de factura: escribiendo dos, el
 * tercero sale solo.
 *
 * El caso real: el proveedor cobra por kilo pero el bulto trae 5,2 kg y en la
 * factura viene el TOTAL de la línea. Hacer la división a mano en cada renglón
 * es donde se cuela el error de dedo, y ese número termina en el costo de la
 * receta.
 *
 * Cuál de los dos manda cuando cambia la cantidad NO se adivina: se recuerda
 * el último que la persona escribió. Si tecleó el total (lo que dice el papel),
 * corregir la cantidad ajusta el unitario y el total queda intacto; si tecleó
 * el unitario (el precio de lista), corregir la cantidad recalcula el total.
 */

/** Cuál de los dos importes escribió la persona por última vez. */
export type ImporteQueManda = 'unitario' | 'total';

export interface LineaDeCosto {
  quantity: number;
  unitPrice: number;
  total: number;
  manda?: ImporteQueManda;
}

/** El total se paga en pesos: sin centavos. */
function redondearTotal(n: number): number {
  return Math.round(n);
}

/**
 * El unitario admite dos decimales: 5,2 kg por $52.000 da $10.000 exactos, pero
 * 3 unidades por $50.000 da $16.666,67 y truncarlo a $16.666 haría que el
 * unitario y el total dejaran de contarse la misma historia.
 */
function redondearUnitario(n: number): number {
  return Math.round(n * 100) / 100;
}

function esUsable(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * Aplica un cambio a la línea y deriva lo que corresponda. Devuelve la línea
 * completa (no un parche) para que el llamador no tenga que decidir nada.
 */
export function derivarLinea(
  linea: LineaDeCosto,
  campo: 'cantidad' | 'unitario' | 'total',
  valor: number,
): Required<LineaDeCosto> {
  // Sin nada escrito todavía manda el unitario, PERO una fila que ya trae total
  // viene de la factura (la leyó la IA o quedó en un borrador) y ese total es el
  // dato duro: es lo que se pagó y lo que usa el costeo. Corregirle la cantidad
  // debe ajustar el unitario, no pisar el total del papel.
  const manda: ImporteQueManda = linea.manda ?? (esUsable(linea.total) ? 'total' : 'unitario');
  const cantidad = campo === 'cantidad' ? valor : linea.quantity;

  if (campo === 'unitario') {
    return {
      quantity: cantidad,
      unitPrice: valor,
      total: esUsable(cantidad) ? redondearTotal(cantidad * valor) : linea.total,
      manda: 'unitario',
    };
  }

  if (campo === 'total') {
    return {
      quantity: cantidad,
      unitPrice: esUsable(cantidad) ? redondearUnitario(valor / cantidad) : linea.unitPrice,
      total: valor,
      manda: 'total',
    };
  }

  // Cambió la cantidad: se recalcula el importe DERIVADO, nunca el que la
  // persona escribió.
  if (manda === 'total') {
    return {
      quantity: cantidad,
      unitPrice: esUsable(cantidad) ? redondearUnitario(linea.total / cantidad) : linea.unitPrice,
      total: linea.total,
      manda,
    };
  }
  return {
    quantity: cantidad,
    unitPrice: linea.unitPrice,
    total: esUsable(cantidad) ? redondearTotal(cantidad * linea.unitPrice) : linea.total,
    manda,
  };
}

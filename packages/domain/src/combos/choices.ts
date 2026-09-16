/**
 * Lo mínimo que necesita un grupo para poder elegirlo. Tipado estructural a
 * propósito: la caja lo llama con `ComboChoiceGroup` y la web con
 * `PublicMenuChoiceGroup` — dos DTOs para la misma pregunta.
 */
export interface ChoiceGroupLike {
  id: string;
  label: string;
  quantity: number;
  options: ReadonlyArray<{ productId: string; productName: string; priceDelta: number }>;
}

/** Lo elegido, con nombre y recargo congelados. Espeja `AppliedChoice`. */
export interface ChoiceSnapshot {
  groupId: string;
  groupLabel: string;
  productId: string;
  productName: string;
  quantity: number;
  priceDelta: number;
}

/**
 * Lo elegido en el selector, por grupo: una casilla POR UNIDAD que el grupo
 * pide. Así se puede mezclar (una Pepsi y una Coca en un combo de dos bebidas),
 * que es lo que la gente pide de verdad.
 *
 * `null` = esa unidad todavía no se eligió. Se arranca en null a propósito: con
 * una opción premarcada, quien va rápido cobra la bebida por defecto y vuelve
 * el descuadre que estos grupos vienen a cerrar.
 */
export type ChoiceSelection = Record<string, Array<string | null>>;

export function nuevaSeleccion(groups: readonly ChoiceGroupLike[]): ChoiceSelection {
  const sel: ChoiceSelection = {};
  for (const g of groups) sel[g.id] = Array.from({ length: g.quantity }, () => null);
  return sel;
}

export function elegir(
  sel: ChoiceSelection,
  groupId: string,
  index: number,
  productId: string,
): ChoiceSelection {
  const actual = sel[groupId] ?? [];
  const siguiente = [...actual];
  siguiente[index] = productId;
  return { ...sel, [groupId]: siguiente };
}

/** Todas las unidades de todos los grupos tienen una opción elegida. */
export function seleccionCompleta(
  groups: readonly ChoiceGroupLike[],
  sel: ChoiceSelection,
): boolean {
  return groups.every((g) => {
    const elegidas = sel[g.id] ?? [];
    return elegidas.length === g.quantity && elegidas.every((p) => p !== null);
  });
}

/**
 * Lo elegido, con nombre y recargo CONGELADOS — igual que el snapshot de los
 * modificadores. Es lo que guarda la venta offline y lo que muestra la fila del
 * carrito; el payload del backend se deriva de acá (`aInputDeChoices`).
 *
 * Dos casillas con la misma bebida se agrupan en `quantity: 2`: mandarlas
 * sueltas sumaría el recargo dos veces y el backend las rechaza como repetidas.
 */
export function aChoices(
  groups: readonly ChoiceGroupLike[],
  sel: ChoiceSelection,
): ChoiceSnapshot[] {
  const out: ChoiceSnapshot[] = [];
  for (const g of groups) {
    const porProducto = new Map<string, number>();
    for (const productId of sel[g.id] ?? []) {
      if (productId === null) continue;
      porProducto.set(productId, (porProducto.get(productId) ?? 0) + 1);
    }
    for (const [productId, quantity] of porProducto) {
      const o = g.options.find((x) => x.productId === productId);
      out.push({
        groupId: g.id,
        groupLabel: g.label,
        productId,
        productName: o?.productName ?? 'opción',
        quantity,
        priceDelta: o?.priceDelta ?? 0,
      });
    }
  }
  return out;
}

/** Lo que viaja en `CreateSale.items[].choices`: el backend re-resuelve nombre
 *  y recargo contra el catálogo, así que solo necesita qué y cuánto. */
export function aInputDeChoices(
  choices: readonly ChoiceSnapshot[],
): Array<{ groupId: string; productId: string; quantity: number }> {
  return choices.map((c) => ({
    groupId: c.groupId,
    productId: c.productId,
    quantity: c.quantity,
  }));
}

/** Recargo total de lo elegido. Se cobra por UNIDAD: dos jugos son dos recargos. */
export function recargoDeSeleccion(
  groups: readonly ChoiceGroupLike[],
  sel: ChoiceSelection,
): number {
  let total = 0;
  for (const g of groups) {
    for (const productId of sel[g.id] ?? []) {
      if (productId === null) continue;
      total += g.options.find((o) => o.productId === productId)?.priceDelta ?? 0;
    }
  }
  return total;
}

/** Resumen para la fila del carrito: "Bebida: 2 Coca-Cola" / "1 Pepsi, 1 Coca". */
export function resumenDeSeleccion(
  groups: readonly ChoiceGroupLike[],
  sel: ChoiceSelection,
): string[] {
  return groups.map((g) => {
    const cuenta = new Map<string, number>();
    for (const productId of sel[g.id] ?? []) {
      if (productId === null) continue;
      cuenta.set(productId, (cuenta.get(productId) ?? 0) + 1);
    }
    const partes = [...cuenta].map(([productId, n]) => {
      const nombre = g.options.find((o) => o.productId === productId)?.productName ?? 'opción';
      return n > 1 ? `${n} ${nombre}` : nombre;
    });
    return `${g.label}: ${partes.join(', ')}`;
  });
}

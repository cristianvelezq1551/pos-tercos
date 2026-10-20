/**
 * Un componente de combo según su variante ("Papas TERCOS · Pollo").
 *
 * La proteína de un plato con variantes vive en la receta de la VARIANTE: un
 * componente sin variante elegida —el plato las ganó después de entrar al
 * combo— o con una que ya no existe no se puede costear con la base. El combo
 * no se vende así, y costearlo con la base pintaría un margen falso. Devuelve
 * el motivo en vez de un costo: nada vale $0, y lo desconocido se dice.
 *
 * Es la ÚNICA fuente de esta regla para los costeos del combo (ficha, costo de
 * la carta y equilibrio): si cada uno la escribiera a mano, se separarían.
 */
export function comboComponentVariant(
  product: { name: string; sizes: ReadonlyArray<{ id: string; name: string }> },
  sizeId: string | null | undefined,
): { name: string; missingReason: string | null } {
  if (sizeId) {
    const size = product.sizes.find((s) => s.id === sizeId);
    return size
      ? { name: `${product.name} · ${size.name}`, missingReason: null }
      : { name: product.name, missingReason: `La variante de "${product.name}" en el combo ya no existe` };
  }
  if (product.sizes.length > 0) {
    return { name: product.name, missingReason: `Falta elegir la variante de ${product.name} en el combo` };
  }
  return { name: product.name, missingReason: null };
}

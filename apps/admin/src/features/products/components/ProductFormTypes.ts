/** Tipo de producto elegido al inicio del wizard. Deriva los flags. */
export type ProductKind = 'simple' | 'variants' | 'drink' | 'combo';

/** Fila de variante (proteína / tamaño). `price` es ABSOLUTO (el cajero/cliente
 *  ve ese precio); el modifier sobre basePrice se calcula al guardar.
 *  `id` presente = variante existente (edición). */
export interface VariantRow {
  id?: string;
  name: string;
  price: string;
}

/** Fila de extra (modificador). El consumo es opcional (1 ítem en la UI). */
export interface ExtraRow {
  name: string;
  priceDelta: string;
  /** '' = no consume inventario. */
  consumeChildType: '' | 'ingredient' | 'subproduct';
  consumeChildId: string;
  consumeQty: string;
}

/** Fila de componente de combo. */
export interface ComboRow {
  productId: string;
  quantity: string;
}

/** Shared form state shape for ProductForm and its sub-components. */
export interface FormState {
  kind: ProductKind;
  name: string;
  description: string;
  preparationSteps: string[];
  basePrice: string;
  category: string;
  imageUrl: string;
  emoji: string;
  modifiersEnabled: boolean;
  isCombo: boolean;
  comboPrice: string;
  isActive: boolean;
  directResale: boolean;
  unitPurchase: string;
  unitStock: string;
  conversionFactor: string;
  thresholdMin: string;
  sizes: VariantRow[];
  modifiers: ExtraRow[];
  comboComponents: ComboRow[];
}

/** Deriva el tipo desde los flags de un producto existente (para edición). */
export function kindFromFlags(p: {
  directResale: boolean;
  isCombo: boolean;
  sizes?: unknown[] | undefined;
}): ProductKind {
  if (p.isCombo) return 'combo';
  if (p.directResale) return 'drink';
  if ((p.sizes?.length ?? 0) > 0) return 'variants';
  return 'simple';
}

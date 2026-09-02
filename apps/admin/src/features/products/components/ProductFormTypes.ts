/** Tipo de producto elegido al inicio del wizard. Deriva los flags. */
export type ProductKind = 'simple' | 'variants' | 'drink' | 'combo';

/**
 * Identidad de una fila del formulario, SOLO para el `key` de React.
 *
 * Con el índice como key, quitar una fila del medio hace que React reuse el DOM
 * de la fila siguiente: el foco salta y el valor a medio escribir se ve en el
 * renglón equivocado. Con una identidad propia, quitar la fila 2 quita la 2.
 *
 * Contador y no UUID a propósito: el formulario se renderiza también en el
 * servidor, y así ambos lados generan la misma secuencia. Nunca viaja a la API
 * (el submit arma objetos explícitos campo por campo).
 */
let rowSeq = 0;
export function newRowKey(): string {
  rowSeq += 1;
  return `fila-${rowSeq}`;
}

/** Fila de variante (proteína / tamaño). `price` es ABSOLUTO (el cajero/cliente
 *  ve ese precio); el modifier sobre basePrice se calcula al guardar.
 *  `id` presente = variante existente (edición). */
export interface VariantRow {
  /** Identidad de fila para React. Ver `newRowKey`. */
  rowKey: string;
  id?: string;
  name: string;
  price: string;
}

/** Fila de extra (modificador). El consumo es opcional (1 ítem en la UI). */
export interface ExtraRow {
  /** Identidad de fila para React. Ver `newRowKey`. */
  rowKey: string;
  name: string;
  priceDelta: string;
  /** '' = no consume inventario. */
  consumeChildType: '' | 'ingredient' | 'subproduct';
  consumeChildId: string;
  consumeQty: string;
}

/** Fila de componente de combo. */
export interface ComboRow {
  /** Identidad de fila para React. Ver `newRowKey`. */
  rowKey: string;
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
  /** Foto de la preparación para la biblia de cocina. '' = sin foto propia. */
  prepImageUrl: string;
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

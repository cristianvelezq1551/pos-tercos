export interface CartLineModifier {
  id: string;
  name: string;
  priceDelta: number;
}

export interface CartLineSize {
  id: string;
  name: string;
  priceModifier: number;
}

export interface CartLine {
  lineId: string;
  productId: string;
  productName: string;
  /** Snapshot de la URL de imagen al momento de agregar. Solo presentación. */
  imageUrl?: string | null;
  size: CartLineSize | null;
  modifiers: CartLineModifier[];
  quantity: number;
  unitPrice: number;
  /**
   * Product.isCombo — habilita COMBO_OFF. El backend cobra ese descuento
   * igual; sin el flag acá la web mostraba el combo a precio lleno y el
   * cliente veía un total distinto al que terminaba pagando.
   * Opcional: los carritos guardados antes de este campo no lo traen.
   */
  isCombo?: boolean;
  /** Nota libre del cliente para este ítem (ej. "sin cebolla"). */
  notes?: string;
}

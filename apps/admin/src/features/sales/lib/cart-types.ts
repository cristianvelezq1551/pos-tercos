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
  /** Identificador único de la línea (no del producto). */
  lineId: string;
  productId: string;
  productName: string;
  size: CartLineSize | null;
  modifiers: CartLineModifier[];
  quantity: number;
  /** basePrice + sizeModifier + sum(modifierDeltas). Sin promos. */
  unitPrice: number;
  /** Nota de cocina para la línea (ej. "sin cebolla"). */
  notes?: string;
  /** Product.isCombo — habilita COMBO_OFF (el backend lo cobra; sin este flag
   *  el preview del carrito no lo mostraba → descuadre de caja en efectivo). */
  isCombo: boolean;
}

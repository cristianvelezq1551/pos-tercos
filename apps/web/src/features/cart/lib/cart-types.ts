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
}

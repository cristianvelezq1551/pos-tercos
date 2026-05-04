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
  size: CartLineSize | null;
  modifiers: CartLineModifier[];
  quantity: number;
  unitPrice: number;
}

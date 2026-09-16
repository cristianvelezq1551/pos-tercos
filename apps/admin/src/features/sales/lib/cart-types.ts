import type { AppliedChoice } from '@pos-tercos/types';

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
  /** Lo elegido en los grupos del combo. Viaja al backend y es lo que decide
   *  qué bebida se descuenta del inventario. */
  choices: AppliedChoice[];
  /** Resumen legible ("Bebida: 2 Coca-Cola") para mostrar en la fila. */
  choiceLabels: string[];
  /**
   * La línea nació de "Separar en N líneas": no vuelve a absorber toques del
   * catálogo. Si alguien la partió a propósito para darle a cada unidad su
   * indicación, juntarle una encima deshace justo lo que acababa de hacer.
   *
   * NO viaja al backend: solo gobierna cómo se agrupa dentro del carrito.
   */
  separada?: boolean;
}

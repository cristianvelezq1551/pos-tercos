/**
 * Datos mínimos para renderizar un recibo. El service backend convierte
 * un Sale + items a esta forma reducida (no exponemos el DTO completo
 * al renderer puro).
 */
export interface ReceiptData {
  /** null en una CORTESÍA: no es una venta y no consume número de recibo. */
  receiptNumber: number | null;
  /** Venta OFFLINE: número provisional (ej. "OFF-7"). Cuando está presente, el
   *  recibo muestra ese número en grande, "RECIBO PROVISIONAL" y un sello
   *  "PENDIENTE DE SINCRONIZAR". El backend NUNCA lo setea (online intacto). */
  provisionalNumber?: string | null;
  /** ISO datetime. */
  createdAt: string;
  cashierName: string | null;
  customerName: string | null;
  items: Array<{
    productName: string;
    sizeName: string | null;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
    lineDiscount: number;
    lineTotal: number;
    appliedPromotionName: string | null;
    modifiers: Array<{ name: string; priceDelta: number }>;
  }>;
  subtotal: number;
  discountTotal: number;
  /** Costo del domicilio (WEB_DELIVERY). 0 = sin envío → no se imprime la línea. */
  deliveryFee?: number;
  total: number;
  /** Pagos de la venta. Con >1 elemento el recibo imprime el desglose de la
   *  cuenta dividida (método + monto por parte, vuelto en efectivo). */
  payments?: Array<{
    method: string;
    amount: number;
    amountReceived: number | null;
  }>;
  /** Marcador para reimpresiones (ej. "DUPLICADO"). null si es la 1ra. */
  reprintLabel: string | null;
  /** Si true, el ESC/POS incluye el pulso para abrir el cajón monedero
   *  (RJ-11 en la impresora). Se usa en ventas en efectivo. */
  openDrawer?: boolean;
  /**
   * Pedido REGALADO. El recibo sale igual —el cliente se lleva su comprobante
   * de lo que recibió— pero con el valor tachado por lo que es: el total a
   * pagar es $0 y aparte se declara cuánto se regaló, que es lo que después
   * el dueño ve como pérdida en el estado financiero.
   */
  cortesia?: { motivo: string; valorRegalado: number } | null;
  /** Branding del negocio (env-provided, no del Sale). */
  business: {
    name: string;
    address: string;
    nit: string;
    phone: string | null;
  };
}

/**
 * Resultado de impresión. `key` y `url` permiten al backend referenciar
 * el documento renderizado (HTML local en dev, PDF firmado en prod).
 */
export interface PrintResult {
  /** Identificador opaco del documento (path relativo en local, key en R2). */
  key: string;
  /** URL navegable (file:// en dev). */
  url: string;
  /** Contenido raw para que el caller pueda servirlo inline si quiere. */
  contentType: string;
  /** Bytes del documento (HTML string codificado utf-8 en mock). */
  body: Buffer;
}

export interface PrinterProvider {
  readonly name: string;
  /**
   * Renderiza + persiste el recibo. En modo mock guarda HTML en
   * `./tmp/receipts/{receiptNumber}.html`. En FASE 15 con ESC/POS real,
   * envía bytes a la impresora física via Print Agent local.
   */
  print(receipt: ReceiptData): Promise<PrintResult>;
}

/**
 * Resultado de abrir el cajón monedero. En mock solo retorna ack.
 * En FASE 15 con cajón real (USB/serial), retorna estado del comando.
 */
export interface DrawerOpenResult {
  ok: true;
  at: string; // ISO datetime
  reason: string | null; // 'sale' (default) o 'no-sale' con motivo
}

export interface CashDrawerProvider {
  readonly name: string;
  open(input: { reason?: string | null }): Promise<DrawerOpenResult>;
}

'use client';

/**
 * Configuración de impresoras LOCAL por terminal (no backend): cada PC del
 * cajero define qué impresoras tiene y qué imprime cada una. Vive en
 * localStorage porque las impresoras son físicas de ESTA máquina.
 *
 * Tipos de documento:
 *  - comanda-cocina: comanda SIN bebidas (excluye reventa directa).
 *  - comanda-completa: comanda con todo (cajero/expedición).
 *  - factura: recibo del cliente.
 */
export const PRINT_DOC_TYPES = ['comanda-cocina', 'comanda-completa', 'factura'] as const;
export type PrintDocType = (typeof PRINT_DOC_TYPES)[number];

export const PRINT_DOC_LABELS: Record<PrintDocType, string> = {
  'comanda-cocina': 'Comanda de cocina (sin bebidas)',
  'comanda-completa': 'Comanda completa',
  factura: 'Factura del cliente',
};

export interface PrinterAssignment {
  /** Nombre de la impresora en Windows (Get-Printer). */
  name: string;
  /** Documentos que imprime esta impresora. */
  docs: PrintDocType[];
}

export interface PrinterConfig {
  printers: PrinterAssignment[];
}

const STORAGE_KEY = 'pos-tercos-printer-config';
/** Evento para que la UI refresque cuando cambia la config. */
export const PRINTER_CONFIG_EVENT = 'pos:printer-config-changed';

const EMPTY: PrinterConfig = { printers: [] };

export function getPrinterConfig(): PrinterConfig {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as PrinterConfig;
    if (!parsed || !Array.isArray(parsed.printers)) return EMPTY;
    // Saneo: solo entradas con nombre y docs válidos.
    const printers = parsed.printers
      .filter((p) => p && typeof p.name === 'string' && p.name.trim().length > 0)
      .map((p) => ({
        name: p.name,
        docs: (Array.isArray(p.docs) ? p.docs : []).filter((d): d is PrintDocType =>
          (PRINT_DOC_TYPES as readonly string[]).includes(d),
        ),
      }));
    return { printers };
  } catch {
    return EMPTY;
  }
}

export function savePrinterConfig(cfg: PrinterConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event(PRINTER_CONFIG_EVENT));
}

/** ¿Hay al menos una impresora con algún documento asignado? */
export function isPrinterConfigured(): boolean {
  return getPrinterConfig().printers.some((p) => p.docs.length > 0);
}

/** Nombres de impresoras que imprimen ese tipo de documento. */
export function printersForDoc(doc: PrintDocType): string[] {
  return getPrinterConfig()
    .printers.filter((p) => p.docs.includes(doc))
    .map((p) => p.name);
}

/**
 * ¿Una misma impresora imprime TANTO la factura COMO alguna comanda? En ese caso
 * (caja con factura + comanda) conviene separar la factura en un paso aparte
 * (modal) para que no salga pegada a la comanda en el mismo rollo. Si la factura
 * va a una impresora distinta de las comandas, se imprime todo automático.
 */
export function facturaSharesPrinterWithComanda(): boolean {
  const { printers } = getPrinterConfig();
  const facturaNames = new Set(
    printers.filter((p) => p.docs.includes('factura')).map((p) => p.name),
  );
  if (facturaNames.size === 0) return false;
  return printers.some(
    (p) =>
      facturaNames.has(p.name) &&
      (p.docs.includes('comanda-cocina') || p.docs.includes('comanda-completa')),
  );
}

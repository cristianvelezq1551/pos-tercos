import type { OfflineAvailabilitySnapshot } from '@pos-tercos/domain';
import type {
  PaymentMethod,
  Product,
  ProductAvailability,
  Promotion,
  Shift,
  User,
} from '@pos-tercos/types';

/** Estado de conexión con el backend (heartbeat + navigator.onLine). */
export type ConnectivityStatus = 'online' | 'offline' | 'checking';

/**
 * Snapshot de la sesión vigente, escrito cuando hay conexión. Permite que el
 * POS abra offline sin SSR (B.0b lo consume). Es info de display, no el token
 * (el token httpOnly lo manda el browser solo cuando vuelve la red).
 */
export interface SessionSnapshot {
  user: User;
  shift: Shift | null;
  cachedAt: string;
}

/** Catálogo + promos + disponibilidad cacheados para vender offline. */
export interface CatalogCache {
  products: Product[];
  promotions: Promotion[];
  availability: ProductAvailability[];
  cachedAt: string;
}

/**
 * Snapshot del grafo de recetas + stock para el ledger local (B.2.2). Se llena
 * desde `GET /products/offline-snapshot`. `*Consumed` acumula lo descontado por
 * las ventas offline → la disponibilidad offline = stock − consumido.
 */
export interface StockLedgerSnapshot {
  snapshot: OfflineAvailabilitySnapshot;
  /** Consumo local de productos de reventa directa (productId → qty). */
  productConsumed: Record<string, number>;
  /** Consumo local de insumos (ingredientId → cantidad en unitRecipe). */
  ingredientConsumed: Record<string, number>;
  /** Consumo local de subproductos (inventario de producción). */
  subproductConsumed: Record<string, number>;
  cachedAt: string;
}

/** Línea de una venta offline (snapshot verbatim para imprimir y sincronizar). */
export interface OfflineSaleLine {
  productId: string;
  sizeId: string | null;
  quantity: number;
  unitPrice: number;
  /** Snapshot de modificadores (precio CONGELADO offline → se sincroniza verbatim). */
  modifiers: Array<{ modifierId: string; name: string; priceDelta: number }>;
  notes: string | null;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  appliedPromotionId: string | null;
}

/** Payload de la venta offline — totales VERBATIM (gana lo cobrado offline). */
export interface OfflineSalePayload {
  type: 'COUNTER';
  customerName: string | null;
  lines: OfflineSaleLine[];
  subtotal: number;
  discount: number;
  total: number;
}

/** Venta offline en la cola. */
export interface OfflineSale {
  localId: string;
  provisionalNumber: string; // OFF-N
  payload: OfflineSalePayload;
  payment: {
    method: PaymentMethod;
    amountReceived: number;
    offlineVerified: boolean;
  };
  soldOfflineAt: string;
  status: 'queued' | 'syncing' | 'synced' | 'failed';
  failReason?: string;
  realReceiptNumber?: number;
  realTurnNumber?: number;
}

/** Contadores de la jornada offline. */
export interface OfflineMeta {
  /** Próximo N para OFF-N (reinicia por jornada). */
  offCounter: number;
  /** Fecha (YYYY-MM-DD local) de la jornada del contador. */
  jornada: string;
  lastSyncAt: string | null;
}

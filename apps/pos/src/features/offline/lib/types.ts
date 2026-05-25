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
 * Snapshot del grafo de recetas + stock para el ledger local (B.2). Se llena
 * desde GET /products/offline-snapshot cuando exista ese endpoint; por ahora
 * el tipo queda definido para fijar el schema de la DB.
 */
export interface StockLedgerSnapshot {
  /** Stock por entidad (insumo/producto), clave `${type}:${id}`. */
  stock: Record<string, number>;
  /** Descuentos locales acumulados por ventas offline (misma clave). */
  consumed: Record<string, number>;
  /** Grafo de recetas serializado (forma exacta se fija en B.2). */
  graph: unknown;
  cachedAt: string;
}

/** Estado de una venta offline en la cola (se usa de lleno en B.2/B.3). */
export interface OfflineSale {
  localId: string;
  provisionalNumber: string; // OFF-N
  payload: unknown; // CreateSale + totales verbatim
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

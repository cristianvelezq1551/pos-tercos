import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  CatalogCache,
  OfflineMeta,
  OfflineSale,
  SessionSnapshot,
  StockLedgerSnapshot,
} from './types';

/**
 * IndexedDB local del POS para el respaldo offline (Fase B).
 *  - `kv`: singletons (sesión, catálogo, ledger, meta) — uno por clave.
 *  - `offlineSales`: cola de ventas offline (B.2/B.3), index por status.
 *
 * El schema se declara completo desde v1 para no migrar versiones después.
 */
interface TercosPosDB extends DBSchema {
  kv: { key: string; value: unknown };
  offlineSales: {
    key: string;
    value: OfflineSale;
    indexes: { 'by-status': string };
  };
}

const DB_NAME = 'tercos-pos';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TercosPosDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TercosPosDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB no disponible (SSR o navegador sin soporte)'));
  }
  if (!dbPromise) {
    dbPromise = openDB<TercosPosDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
        if (!db.objectStoreNames.contains('offlineSales')) {
          const store = db.createObjectStore('offlineSales', { keyPath: 'localId' });
          store.createIndex('by-status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

// ── kv singletons ─────────────────────────────────────────────────────
const KEY_SESSION = 'sessionSnapshot';
const KEY_CATALOG = 'catalogCache';
const KEY_LEDGER = 'stockLedger';
const KEY_META = 'meta';

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const v = await (await getDb()).get('kv', key);
    return (v as T) ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('kv', value, key);
}

export const offlineDb = {
  // Sesión (user + shift)
  getSession: () => kvGet<SessionSnapshot>(KEY_SESSION),
  setSession: (s: SessionSnapshot) => kvSet(KEY_SESSION, s),

  // Catálogo + promos + disponibilidad
  getCatalog: () => kvGet<CatalogCache>(KEY_CATALOG),
  setCatalog: (c: CatalogCache) => kvSet(KEY_CATALOG, c),

  // Ledger de stock (B.2)
  getLedger: () => kvGet<StockLedgerSnapshot>(KEY_LEDGER),
  setLedger: (l: StockLedgerSnapshot) => kvSet(KEY_LEDGER, l),

  // Meta (contadores de jornada)
  getMeta: () => kvGet<OfflineMeta>(KEY_META),
  setMeta: (m: OfflineMeta) => kvSet(KEY_META, m),

  // Cola de ventas offline (B.2/B.3)
  async putSale(sale: OfflineSale): Promise<void> {
    await (await getDb()).put('offlineSales', sale);
  },
  async listSales(): Promise<OfflineSale[]> {
    try {
      return await (await getDb()).getAll('offlineSales');
    } catch {
      return [];
    }
  },
  async countPending(): Promise<number> {
    try {
      const db = await getDb();
      const queued = await db.countFromIndex('offlineSales', 'by-status', 'queued');
      const failed = await db.countFromIndex('offlineSales', 'by-status', 'failed');
      const syncing = await db.countFromIndex('offlineSales', 'by-status', 'syncing');
      return queued + failed + syncing;
    } catch {
      return 0;
    }
  },
  async deleteSale(localId: string): Promise<void> {
    await (await getDb()).delete('offlineSales', localId);
  },
};

/**
 * Pide al navegador almacenamiento PERSISTENTE para que NO borre la cola
 * offline (= ventas = plata) bajo presión de espacio. Devuelve si quedó
 * persistente. Best-effort: si el navegador lo deniega, igual operamos.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

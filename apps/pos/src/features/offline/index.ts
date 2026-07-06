export { OfflineProvider, OfflineStatusBar, useOffline } from './components/OfflineProvider';
export { useConnectivity } from './hooks/useConnectivity';
export {
  enqueueOfflineSale,
  enqueueOfflineShiftOpen,
  getCachedCashierName,
} from './lib/enqueue-sale';
export { offlineDb } from './lib/db';
export { computeOfflineAvailability } from './lib/offline-availability';
export { drainOfflineQueue } from './lib/sync-engine';
export type {
  ConnectivityStatus,
  OfflineSale,
  OfflineSaleLine,
  OfflineSalePayload,
  OfflineShiftOpen,
} from './lib/types';

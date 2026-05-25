export { OfflineProvider, OfflineStatusBar, useOffline } from './components/OfflineProvider';
export { useConnectivity } from './hooks/useConnectivity';
export { enqueueOfflineSale, getCachedCashierName } from './lib/enqueue-sale';
export { drainOfflineQueue } from './lib/sync-engine';
export type {
  ConnectivityStatus,
  OfflineSale,
  OfflineSaleLine,
  OfflineSalePayload,
} from './lib/types';

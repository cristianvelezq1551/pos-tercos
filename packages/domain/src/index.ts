export * from './common';
export * from './recipe';
export * from './cost-fifo';
export * from './availability';
export * from './llm';
export * from './storage';
export * from './matching';
export * from './promotions';
export * from './geo';
export * from './address';
export * from './schedule';
export * from './reconciliation';
export * from './printer';
export * from './whatsapp';
export * from './payroll';
export * from './finance';
export * from './sales';
export * from './purchasing';

// SOLO tipos: el canal de alertas es una interfaz que implementa el API. Un
// `export *` acá emitiría un require en el bundle de las cinco apps (el
// paquete compila a CJS, §7.v40); un `export type` se borra al compilar.
export type { AlertChannel, AlertDeliveryResult, SystemAlert } from './alerts/alert-channel';
export type {
  PushNotifier,
  PushTarget,
  PushMessage,
  PushDeliveryResult,
} from './alerts/push-notifier';

// La guía NO se re-exporta acá a propósito: son ~250 KB de texto y este paquete
// compila a CJS, así que colgarla del barril la metía en el bundle del
// navegador de la web del cliente solo por importar `buildWebOrderLink`.
// Se consume por subruta: `@pos-tercos/domain/guia`.

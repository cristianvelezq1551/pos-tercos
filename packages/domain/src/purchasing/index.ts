export {
  computeSuggestedPurchase,
  normalizeConversionFactor,
  type SuggestPurchaseInput,
  type SuggestedPurchase,
} from './suggest-quantity';
export {
  renderPurchaseOrderHtml,
  type PurchaseOrderDoc,
  type PurchaseOrderItem,
} from './render-purchase-order';
export {
  renderShortageListHtml,
  type ShortageListDoc,
  type ShortageListItem,
} from './render-shortage-list';
export { bucketOf, bucketsBetween } from './period-buckets';
export type { BucketGranularity, PeriodBucket } from './period-buckets';
export {
  DIFERENCIA_VISIBLE_COP,
  PCT_FLETE_ALTO,
  TOLERANCIA_TOTAL_PISO_COP,
  fleteEsAlto,
  toleranciaDelTotal,
  totalCuadra,
} from './freight-rules';

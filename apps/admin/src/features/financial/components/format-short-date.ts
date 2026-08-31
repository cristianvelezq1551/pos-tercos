import { BUSINESS_TIME_ZONE } from '@pos-tercos/ui';
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: 'short',
  });
}

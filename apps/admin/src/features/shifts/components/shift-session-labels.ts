// Labels compartidos entre breakdowns y la tabla de pedidos de la sesión.

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  QR_BANCOLOMBIA: 'QR Bancolombia',
  TRANSFER: 'Transferencia',
};

export const TYPE_LABEL: Record<string, string> = {
  COUNTER: 'Mostrador',
  WEB_PICKUP: 'Web (retiro)',
};

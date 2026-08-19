import type { Sale, WhatsAppNotificationStageCode } from '@pos-tercos/types';

export interface WhatsAppStagePrompt {
  stage: WhatsAppNotificationStageCode;
  /** Texto del botón: qué le va a llegar al cliente, no el nombre de la etapa. */
  label: string;
  /** Ya se le avisó de esta etapa. */
  sent: boolean;
}

/**
 * Qué le toca avisarle al cliente según en qué punto está el pedido. Un solo
 * aviso vigente por vez: el cajero no elige etapas, sigue el pedido.
 *
 * null = no hay nada que avisar ahora. Dos casos distintos:
 *  - Estado final donde el aviso no aporta (ENTREGADO: ya tiene la comida).
 *  - Domicilio sin envío cotizado: el mensaje llevaría un total que va a
 *    cambiar, que es exactamente lo que el flujo evita.
 */
export function whatsappStageFor(sale: Sale): WhatsAppStagePrompt | null {
  const n = sale.notified;
  const isDelivery = sale.type === 'WEB_DELIVERY';

  switch (sale.status) {
    case 'PENDIENTE_PAGO': {
      // En un DOMICILIO este aviso lo manda el campo del envío, en el mismo
      // toque en que se carga la tarifa: son una sola acción. Poner además un
      // botón acá obligaba a apretar dos cosas seguidas para una sola idea.
      if (isDelivery) return null;
      return {
        stage: 'payment_instructions',
        label: 'Enviar datos de pago',
        sent: n?.paymentInstructions ?? false,
      };
    }
    case 'PAGADO':
      return {
        stage: 'payment_received',
        label: 'Avisar que el pago entró',
        sent: n?.paymentReceived ?? false,
      };
    case 'LISTO_DESPACHO':
      return {
        stage: 'pickup_ready',
        label: isDelivery ? 'Avisar que va en camino' : 'Avisar que está listo',
        sent: n?.readyForPickup ?? false,
      };
    case 'CANCELADO_NO_PAGO':
    case 'CANCELADO_SIN_REEMBOLSO':
      return {
        stage: 'canceled',
        label: 'Avisar la cancelación',
        sent: n?.canceled ?? false,
      };
    default:
      // ENTREGADO (ya comió), VOID y los estados de cocina heredados.
      return null;
  }
}

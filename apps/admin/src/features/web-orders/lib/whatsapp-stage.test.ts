import type { Sale, SaleStatus, SaleType } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { whatsappStageFor } from './whatsapp-stage';

const sale = (over: Partial<Sale> = {}): Sale =>
  ({
    id: 's1',
    receiptNumber: 1,
    type: 'WEB_PICKUP' as SaleType,
    status: 'PENDIENTE_PAGO' as SaleStatus,
    deliveryFee: 0,
    subtotal: 10_000,
    discountTotal: 0,
    total: 10_000,
    createdAt: new Date().toISOString(),
    idempotencyKey: null,
    ...over,
  }) as Sale;

describe('whatsappStageFor', () => {
  it('un pedido para recoger sin pagar: se le mandan los datos de pago', () => {
    expect(whatsappStageFor(sale())).toMatchObject({
      stage: 'payment_instructions',
      sent: false,
    });
  });

  /**
   * En un domicilio sin cobrar, el aviso lo manda el campo del envío junto con
   * la tarifa (una sola acción). La tarjeta no debe ofrecer un segundo botón,
   * ni con el envío cargado ni sin él.
   */
  it('un domicilio sin cobrar no ofrece botón: lo maneja el campo del envío', () => {
    expect(whatsappStageFor(sale({ type: 'WEB_DELIVERY', deliveryFee: 0 }))).toBeNull();
    expect(
      whatsappStageFor(sale({ type: 'WEB_DELIVERY', deliveryFee: 6000, total: 16_000 })),
    ).toBeNull();
  });

  it('pagado → avisar que entró la plata', () => {
    expect(whatsappStageFor(sale({ status: 'PAGADO' }))).toMatchObject({
      stage: 'payment_received',
    });
  });

  it('el texto del botón distingue "va en camino" de "está listo"', () => {
    expect(whatsappStageFor(sale({ status: 'LISTO_DESPACHO' }))?.label).toContain('listo');
    expect(
      whatsappStageFor(
        sale({ status: 'LISTO_DESPACHO', type: 'WEB_DELIVERY', deliveryFee: 6000 }),
      )?.label,
    ).toContain('camino');
  });

  it('cancelado → avisar la cancelación', () => {
    expect(whatsappStageFor(sale({ status: 'CANCELADO_NO_PAGO' }))).toMatchObject({
      stage: 'canceled',
    });
  });

  it('entregado y anulado no ofrecen avisar: ya no hay nada que decir', () => {
    expect(whatsappStageFor(sale({ status: 'ENTREGADO', type: 'WEB_DELIVERY' }))).toBeNull();
    expect(whatsappStageFor(sale({ status: 'VOID' }))).toBeNull();
  });

  it('refleja lo YA avisado en vez de asumir que no se avisó', () => {
    const ya = sale({
      status: 'PAGADO',
      notified: {
        paymentInstructions: true,
        paymentReceived: true,
        readyForPickup: false,
        canceled: false,
      },
    });
    expect(whatsappStageFor(ya)?.sent).toBe(true);
    expect(whatsappStageFor(sale({ status: 'PAGADO' }))?.sent).toBe(false);
  });
});

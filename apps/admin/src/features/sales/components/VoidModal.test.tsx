// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Sale } from '@pos-tercos/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La anulación revierte stock y saca plata de la caja: el botón NO puede
 * habilitarse sin venta seleccionada + motivo (5-200) + PIN de 6 dígitos, y
 * solo ventas PAGADO (no iniciadas por cocina) son anulables. Mutantes que
 * estos tests matan: filtro de status relajado, validación de PIN/motivo
 * salteada, anulación sin selección.
 *
 * Y desde que la anulación tiene DOS desenlaces —según si la comida salió o
 * no— el desenlace es obligatorio: sin responder no se confirma, porque esa
 * respuesta decide si la pérdida entra a los libros o desaparece.
 */
/** Responde "¿el cliente se llevó la comida?" con la opción indicada. */
function respondeSiSalio(salio: boolean): void {
  fireEvent.click(
    screen.getByRole('radio', {
      name: salio ? /Sí, ya se había preparado/ : /No, se cobró por error/,
    }),
  );
}

const listSales = vi.fn();
vi.mock('../api/list', () => ({ listSales: (...a: unknown[]) => listSales(...a) }));
const voidSale = vi.fn();
const refundSale = vi.fn();
vi.mock('../api/void', () => ({
  voidSale: (...a: unknown[]) => voidSale(...a),
  refundSale: (...a: unknown[]) => refundSale(...a),
}));
const printComanda = vi.fn().mockResolvedValue(undefined);
vi.mock('../api/print', () => ({ printComanda: (...a: unknown[]) => printComanda(...a) }));
vi.mock('../lib/comanda-events', () => ({ notifyComandaFailed: vi.fn() }));
vi.mock('../../../lib/caja-events', () => ({ notifyCajaChanged: vi.fn() }));
vi.mock('../../../lib/client-log', () => ({ logError: vi.fn() }));

import { VoidModal } from './VoidModal';

function sale(over: Partial<Sale>): Sale {
  return {
    id: 'id-1',
    receiptNumber: 7,
    status: 'PAGADO',
    total: 15000,
    createdAt: '2026-07-06T10:00:00.000Z',
    paidAt: '2026-07-06T10:01:00.000Z',
    paymentMethod: 'CASH',
    ...over,
  } as unknown as Sale;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VoidModal', () => {
  it('lista SOLO ventas PAGADO (una iniciada/entregada no es anulable)', async () => {
    listSales.mockResolvedValue([
      sale({ id: 'a', receiptNumber: 1, status: 'PAGADO' }),
      sale({ id: 'b', receiptNumber: 2, status: 'ENTREGADO' }),
      sale({ id: 'c', receiptNumber: 3, status: 'EN_PREPARACION' }),
    ]);
    render(<VoidModal open shiftId="s1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByText('Recibo #1')).toBeDefined();
    expect(screen.queryByText('Recibo #2')).toBeNull();
    expect(screen.queryByText('Recibo #3')).toBeNull();
  });

  it('el botón Anular solo se habilita con venta + motivo válido + PIN de 6 dígitos', async () => {
    listSales.mockResolvedValue([sale({ id: 'a', receiptNumber: 1 })]);
    render(<VoidModal open shiftId="s1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText('Recibo #1');

    const confirmBtn = screen.getByRole('button', { name: 'Anular venta' });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    respondeSiSalio(false);
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    const reason = screen.getByPlaceholderText(/cliente devolvió/);
    fireEvent.change(reason, { target: { value: 'err' } }); // <5 chars
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(reason, { target: { value: 'pedido equivocado' } });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true); // falta PIN

    const pin = screen.getByPlaceholderText('••••••');
    fireEvent.change(pin, { target: { value: '12345' } }); // 5 dígitos
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(pin, { target: { value: '123456' } });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('el input de PIN descarta lo no-numérico y corta en 6', async () => {
    listSales.mockResolvedValue([sale({})]);
    render(<VoidModal open shiftId="s1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText('Recibo #7');

    const pin = screen.getByPlaceholderText('••••••') as HTMLInputElement;
    fireEvent.change(pin, { target: { value: '12ab34cd5678' } });
    expect(pin.value).toBe('123456');
  });

  it('anular llama voidSale con motivo recortado + PIN y notifica éxito', async () => {
    const voided = sale({ id: 'a', receiptNumber: 1, status: 'VOID' });
    listSales.mockResolvedValue([sale({ id: 'a', receiptNumber: 1 })]);
    voidSale.mockResolvedValue(voided);
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<VoidModal open shiftId="s1" onClose={onClose} onSuccess={onSuccess} />);
    await screen.findByText('Recibo #1');

    fireEvent.click(screen.getAllByRole('radio')[0]);
    respondeSiSalio(false);
    fireEvent.change(screen.getByPlaceholderText(/cliente devolvió/), {
      target: { value: '  pedido equivocado  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(voided));
    expect(voidSale).toHaveBeenCalledWith('a', { reason: 'pedido equivocado' }, '654321');
    expect(onClose).toHaveBeenCalled();
    // #8: la cocina recibe el ticket de ANULACIÓN.
    expect(printComanda).toHaveBeenCalledWith('a', { cancel: true });
  });

  it('PIN rechazado por el server → muestra el error y NO cierra', async () => {
    listSales.mockResolvedValue([sale({ id: 'a', receiptNumber: 1 })]);
    voidSale.mockRejectedValue(new Error('PIN incorrecto'));
    const onClose = vi.fn();
    render(<VoidModal open shiftId="s1" onClose={onClose} onSuccess={vi.fn()} />);
    await screen.findByText('Recibo #1');

    fireEvent.click(screen.getAllByRole('radio')[0]);
    respondeSiSalio(false);
    fireEvent.change(screen.getByPlaceholderText(/cliente devolvió/), {
      target: { value: 'pedido equivocado' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * El caso que motivó todo: hasta ahora, devolverle la plata a alguien cuya
   * comida YA se había hecho solo se podía hacer anulando, y anular devuelve
   * el inventario — así que el costo desaparecía de los libros.
   */
  it('si la comida SÍ salió llama al reembolso, NO a la anulación', async () => {
    const devuelta = sale({ id: 'a', receiptNumber: 1, status: 'VOID' });
    listSales.mockResolvedValue([sale({ id: 'a', receiptNumber: 1 })]);
    refundSale.mockResolvedValue(devuelta);
    const onSuccess = vi.fn();
    render(<VoidModal open shiftId="s1" onClose={vi.fn()} onSuccess={onSuccess} />);
    await screen.findByText('Recibo #1');

    fireEvent.click(screen.getAllByRole('radio')[0]);
    respondeSiSalio(true);
    fireEvent.change(screen.getByPlaceholderText(/cliente devolvió/), {
      target: { value: 'se demoró y pidió la plata' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devolver la plata' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(devuelta));
    expect(refundSale).toHaveBeenCalledWith('a', { reason: 'se demoró y pidió la plata' }, '654321');
    expect(voidSale).not.toHaveBeenCalled();
    // La cocina NO recibe ticket de anular: ese pedido ya salió del local.
    expect(printComanda).not.toHaveBeenCalled();
  });

  it('el botón nombra lo que va a pasar según la respuesta', async () => {
    listSales.mockResolvedValue([sale({ id: 'a', receiptNumber: 1 })]);
    render(<VoidModal open shiftId="s1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText('Recibo #1');
    fireEvent.click(screen.getAllByRole('radio')[0]);

    respondeSiSalio(true);
    expect(screen.getByRole('button', { name: 'Devolver la plata' })).toBeDefined();
    respondeSiSalio(false);
    expect(screen.getByRole('button', { name: 'Anular venta' })).toBeDefined();
  });
});

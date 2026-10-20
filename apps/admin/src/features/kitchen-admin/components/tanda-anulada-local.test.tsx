// @vitest-environment jsdom
import type { KitchenProductionRun } from '@pos-tercos/types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Anular una tanda y que la fila NO se marque hasta recargar.
 *
 * Lo que pasaba: la tabla dependía de un solo `router.refresh()`, que a veces
 * vuelve con la lista de antes (200 en milisegundos, sin consultar) y no
 * reintenta. El refresco de acá NO hace nada, a propósito: la fila tiene que
 * marcarse igual con lo que el servidor ya confirmó.
 */
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../api/client', () => ({
  previewProductionVoid: vi.fn().mockResolvedValue({
    runId: 'r1',
    blockedReason: null,
    lines: [],
    goesNegative: [],
  }),
  voidProduction: vi.fn().mockResolvedValue(undefined),
}));

const { ProductionsTable } = await import('./ProductionsTable');

const RUN: KitchenProductionRun = {
  runId: '11111111-1111-4111-8111-111111111111',
  subproductId: '22222222-2222-4222-8222-222222222222',
  subproductName: 'Salsa de la casa',
  quantityProduced: 10,
  unit: 'porción',
  userId: null,
  userName: 'Rony',
  notes: null,
  evidenceUrl: null,
  createdAt: '2026-10-20T14:31:00.000Z',
  inputs: [],
  voidedAt: null,
  voidedByName: null,
  voidReason: null,
};

describe('anular una tanda la marca en la lista sin esperar el refresco', () => {
  it('después de anular, la fila dice "Anulada" aunque el refresco vuelva viejo', async () => {
    render(<ProductionsTable runs={[RUN]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la tanda de Salsa de la casa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anular tanda' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Motivo de la anulación'), {
      target: { value: 'Se registró por error' },
    });
    const confirmar = within(dialogo).getByRole('button', { name: 'Anular tanda' });
    await waitFor(() => expect((confirmar as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirmar);
    const fila = await screen.findByRole('row', { name: /Salsa de la casa/ });
    await waitFor(() => expect(within(fila).getByText('Anulada')).toBeTruthy());
    expect(refresh).toHaveBeenCalled();
  });

  it('REGRESIÓN: una tanda que nadie anuló sigue viva', () => {
    render(<ProductionsTable runs={[RUN]} />);
    expect(screen.queryByText('Anulada')).toBeNull();
  });
});

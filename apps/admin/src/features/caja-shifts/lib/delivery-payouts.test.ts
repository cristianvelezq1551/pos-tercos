import { DELIVERY_PAYOUT_PURPOSE, type CashMovement } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { agruparDomicilios, movimientosSueltos, totalDomicilios } from './delivery-payouts';

const mov = (p: Partial<CashMovement>): CashMovement => ({
  id: crypto.randomUUID(),
  shiftId: 'shift-1',
  type: 'OUT',
  method: 'CASH',
  amount: 1_000,
  reason: 'motivo',
  userId: 'user-1',
  userName: 'Cajero',
  createdAt: '2026-09-12T10:00:00.000Z',
  purpose: null,
  pairId: null,
  ...p,
});

const par = (pairId: string, amount: number, nota?: string): CashMovement[] => [
  mov({
    type: 'OUT',
    method: 'CASH',
    amount,
    pairId,
    purpose: DELIVERY_PAYOUT_PURPOSE,
    reason: `Domicilio pagado en efectivo del cajón${nota ? ` · ${nota}` : ''}`,
  }),
  mov({
    type: 'IN',
    method: 'TRANSFER',
    amount,
    pairId,
    purpose: DELIVERY_PAYOUT_PURPOSE,
    reason: `Domicilio que el cliente pagó por transferencia${nota ? ` · ${nota}` : ''}`,
  }),
];

describe('domicilios pagados del cajón', () => {
  it('arma UN domicilio por pareja, con el monto que salió del cajón', () => {
    const d = agruparDomicilios([...par('a', 8_000), ...par('b', 5_000)]);
    expect(d).toHaveLength(2);
    expect(d.map((x) => x.amount).sort((p, q) => p - q)).toEqual([5_000, 8_000]);
  });

  it('no cuenta dos veces: la entrada a la cuenta es la otra cara del mismo domicilio', () => {
    expect(totalDomicilios(par('a', 8_000))).toBe(8_000);
  });

  it('rescata la referencia que escribió el cajero, sin el texto fijo', () => {
    expect(agruparDomicilios(par('a', 8_000, 'pedido de la 30'))[0].note).toBe('pedido de la 30');
  });

  it('sin referencia, la nota queda vacía y no inventa texto', () => {
    expect(agruparDomicilios(par('a', 8_000))[0].note).toBeNull();
  });

  it('un movimiento suelto nunca se confunde con un domicilio', () => {
    const sueltos = [mov({ reason: 'Compra de hielo' }), mov({ type: 'IN', reason: 'Base' })];
    expect(agruparDomicilios(sueltos)).toHaveLength(0);
    expect(movimientosSueltos([...sueltos, ...par('a', 8_000)])).toHaveLength(2);
  });

  it('una pata sin pareja no arma un domicilio a medias', () => {
    const huerfana = mov({ purpose: DELIVERY_PAYOUT_PURPOSE, pairId: null, amount: 9_000 });
    expect(agruparDomicilios([huerfana])).toHaveLength(0);
  });

  it('los más nuevos van primero: el cajero corrige el que acaba de registrar', () => {
    const viejo = par('a', 1_000).map((m) => ({ ...m, createdAt: '2026-09-12T08:00:00.000Z' }));
    const nuevo = par('b', 2_000).map((m) => ({ ...m, createdAt: '2026-09-12T09:00:00.000Z' }));
    expect(agruparDomicilios([...viejo, ...nuevo]).map((d) => d.pairId)).toEqual(['b', 'a']);
  });
});

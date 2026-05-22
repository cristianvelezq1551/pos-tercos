/**
 * Tests del builder de alerta de descuadre (wa.me al Dueño, no al cliente).
 */
import { describe, it, expect } from 'vitest';
import { buildDiscrepancyAlertLink } from './build-link';

const SHIFT_ID = 'abcdef12-3456-7890-abcd-ef1234567890';

describe('whatsapp discrepancy alert', () => {
  it('genera link con monto y firma del faltante', () => {
    const r = buildDiscrepancyAlertLink({
      ownerPhone: '+573001234567',
      cashierName: 'Ana',
      difference: -15000,
      shiftId: SHIFT_ID,
      closedAt: new Date('2026-05-21T22:30:00'),
      businessName: 'Tercos',
    });
    expect(r).toBeTruthy();
    expect(r!.url).toContain('https://wa.me/573001234567');
    expect(r!.messagePlain).toContain('faltante');
    expect(r!.messagePlain).toContain('$15.000');
  });

  it('sobrante con signo +', () => {
    const r = buildDiscrepancyAlertLink({
      ownerPhone: '573001234567',
      cashierName: 'Ana',
      difference: 8000,
      shiftId: SHIFT_ID,
      closedAt: new Date('2026-05-21T22:30:00'),
      businessName: 'Tercos',
    });
    expect(r).toBeTruthy();
    expect(r!.messagePlain).toContain('+$8.000');
    expect(r!.messagePlain).toContain('sobrante');
  });

  it('sin ownerPhone → null', () => {
    const r = buildDiscrepancyAlertLink({
      ownerPhone: null,
      cashierName: 'Ana',
      difference: 8000,
      shiftId: SHIFT_ID,
      closedAt: new Date('2026-05-21T22:30:00'),
      businessName: 'Tercos',
    });
    expect(r).toBeNull();
  });
});

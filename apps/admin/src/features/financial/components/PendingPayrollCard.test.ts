import { describe, expect, it } from 'vitest';
import { diaSoloAlMediodiaUtc } from './PendingPayrollCard';

/**
 * La aserción es sobre el INSTANTE, no sobre el texto: el texto depende de la
 * zona de la máquina que corre la prueba y pasaría igual con el error puesto.
 * Anclar al mediodía UTC es lo que hace que el servidor (Vercel, UTC) y el
 * navegador (Bogotá) pinten el MISMO día.
 */
describe('diaSoloAlMediodiaUtc', () => {
  it('ancla la fecha-solo al mediodía UTC, no a la medianoche del runtime', () => {
    expect(diaSoloAlMediodiaUtc('2026-07-09').toISOString()).toBe('2026-07-09T12:00:00.000Z');
  });

  it('cae en el mismo día calendario en Bogotá y en UTC', () => {
    const d = diaSoloAlMediodiaUtc('2026-07-09');
    const enBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
    const enUtc = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d);
    expect(enBogota).toBe('2026-07-09');
    expect(enUtc).toBe('2026-07-09');
  });
});

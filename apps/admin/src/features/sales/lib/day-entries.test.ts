import type { CortesiaRequest, Sale } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { entryMatchesFilter, mergeDayEntries } from './day-entries';
import { HISTORY_FILTERS } from './history-filters';

function sale(id: string, createdAt: string, status: Sale['status'] = 'PAGADO'): Sale {
  return { id, createdAt, status } as unknown as Sale;
}

function cortesia(id: string, createdAt: string): CortesiaRequest {
  return { id, createdAt, status: 'APPROVED' } as unknown as CortesiaRequest;
}

const filterFor = (key: string) => HISTORY_FILTERS.find((f) => f.key === key)!;

describe('mergeDayEntries', () => {
  it('intercala cortesías y ventas por hora, más reciente primero', () => {
    const entries = mergeDayEntries(
      [sale('s1', '2026-07-30T13:00:00.000Z'), sale('s2', '2026-07-30T15:00:00.000Z')],
      [cortesia('c1', '2026-07-30T14:00:00.000Z')],
    );
    expect(entries.map((e) => e.id)).toEqual(['s2', 'c1', 's1']);
    expect(entries[1]!.kind).toBe('cortesia');
  });

  it('sin cortesías devuelve solo las ventas', () => {
    const entries = mergeDayEntries([sale('s1', '2026-07-30T13:00:00.000Z')], []);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('sale');
  });
});

describe('entryMatchesFilter', () => {
  const gift = mergeDayEntries([], [cortesia('c1', '2026-07-30T14:00:00.000Z')])[0]!;

  it('la cortesía aparece en «Todos»', () => {
    expect(entryMatchesFilter(gift, filterFor('todos'))).toBe(true);
  });

  it('la cortesía NO aparece en los filtros por estado de venta', () => {
    for (const key of ['pago', 'pagados', 'listos', 'anulados']) {
      expect(entryMatchesFilter(gift, filterFor(key))).toBe(false);
    }
  });

  it('la venta se filtra por su estado', () => {
    const paid = mergeDayEntries([sale('s1', '2026-07-30T13:00:00.000Z', 'PAGADO')], [])[0]!;
    expect(entryMatchesFilter(paid, filterFor('pagados'))).toBe(true);
    expect(entryMatchesFilter(paid, filterFor('anulados'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  EMPTY_WEEKLY,
  isOpenAt,
  nextOpenAt,
  resolveDayRanges,
  toMinutes,
  type OpeningHours,
} from './opening-hours';

const NIGHT = [{ start: '17:00', end: '23:00' }];

/** Cerrado los lunes, 17:00–23:00 el resto. El caso real de TERCOS. */
const base: OpeningHours = {
  weekly: {
    ...EMPTY_WEEKLY,
    tue: NIGHT,
    wed: NIGHT,
    thu: NIGHT,
    fri: NIGHT,
    sat: NIGHT,
    sun: NIGHT,
  },
  overrides: [],
  restDayHolidayShift: true,
};

// Fechas reales verificadas: 2026-07-13 lunes normal · 2026-07-20 lunes FESTIVO
// (Independencia) · 2026-07-21 el martes siguiente · 2026-07-14 martes normal.
const MON_NORMAL = '2026-07-13';
const MON_HOLIDAY = '2026-07-20';
const TUE_AFTER_HOLIDAY = '2026-07-21';
const TUE_NORMAL = '2026-07-14';

describe('toMinutes', () => {
  it('parsea HH:MM y rechaza basura', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('17:30')).toBe(1050);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('24:00')).toBeNaN();
    expect(toMinutes('17:60')).toBeNaN();
    expect(toMinutes('7:00')).toBeNaN();
    expect(toMinutes('')).toBeNaN();
  });
});

describe('resolveDayRanges', () => {
  it('el lunes normal está cerrado', () => {
    expect(resolveDayRanges(MON_NORMAL, base)).toEqual([]);
  });

  it('el martes abre en su horario', () => {
    expect(resolveDayRanges(TUE_NORMAL, base)).toEqual(NIGHT);
  });

  it('lunes FESTIVO: se trabaja con el horario del martes', () => {
    expect(resolveDayRanges(MON_HOLIDAY, base)).toEqual(NIGHT);
  });

  it('lunes FESTIVO: el descanso se corre al martes siguiente', () => {
    expect(resolveDayRanges(TUE_AFTER_HOLIDAY, base)).toEqual([]);
  });

  it('con la regla apagada, el lunes festivo sigue cerrado y el martes abre', () => {
    const off: OpeningHours = { ...base, restDayHolidayShift: false };
    expect(resolveDayRanges(MON_HOLIDAY, off)).toEqual([]);
    expect(resolveDayRanges(TUE_AFTER_HOLIDAY, off)).toEqual(NIGHT);
  });

  it('un override abre un lunes normal', () => {
    const hours: OpeningHours = {
      ...base,
      overrides: [
        { date: MON_NORMAL, closed: false, ranges: [{ start: '12:00', end: '20:00' }] },
      ],
    };
    expect(resolveDayRanges(MON_NORMAL, hours)).toEqual([{ start: '12:00', end: '20:00' }]);
  });

  it('un override cierra un día que normalmente abre', () => {
    const hours: OpeningHours = {
      ...base,
      overrides: [{ date: TUE_NORMAL, closed: true, ranges: [], note: 'Fumigación' }],
    };
    expect(resolveDayRanges(TUE_NORMAL, hours)).toEqual([]);
  });

  it('el override le gana a la regla de festivos', () => {
    const hours: OpeningHours = {
      ...base,
      overrides: [{ date: MON_HOLIDAY, closed: true, ranges: [] }],
    };
    expect(resolveDayRanges(MON_HOLIDAY, hours)).toEqual([]);
    // ...y el martes sigue descansando: la regla se evaluó sobre el lunes.
    expect(resolveDayRanges(TUE_AFTER_HOLIDAY, hours)).toEqual([]);
  });

  it('devuelve los rangos ordenados por hora de inicio', () => {
    const hours: OpeningHours = {
      ...base,
      weekly: {
        ...base.weekly,
        wed: [
          { start: '18:00', end: '23:00' },
          { start: '12:00', end: '15:00' },
        ],
      },
    };
    expect(resolveDayRanges('2026-07-15', hours)).toEqual([
      { start: '12:00', end: '15:00' },
      { start: '18:00', end: '23:00' },
    ]);
  });
});

describe('isOpenAt', () => {
  const at = (date: string, h: number, m = 0) => {
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(y!, mo! - 1, d!, h, m);
  };

  it('dentro del rango abre; fuera cierra', () => {
    expect(isOpenAt(at(TUE_NORMAL, 18), base)).toBe(true);
    expect(isOpenAt(at(TUE_NORMAL, 17, 0), base)).toBe(true); // borde de apertura: incluido
    expect(isOpenAt(at(TUE_NORMAL, 16, 59), base)).toBe(false);
    expect(isOpenAt(at(TUE_NORMAL, 23, 0), base)).toBe(false); // borde de cierre: excluido
  });

  it('el lunes normal está cerrado a cualquier hora', () => {
    expect(isOpenAt(at(MON_NORMAL, 12), base)).toBe(false);
    expect(isOpenAt(at(MON_NORMAL, 19), base)).toBe(false);
  });

  it('el lunes festivo abre en el horario del martes', () => {
    expect(isOpenAt(at(MON_HOLIDAY, 19), base)).toBe(true);
    expect(isOpenAt(at(TUE_AFTER_HOLIDAY, 19), base)).toBe(false);
  });

  it('un rango que cruza medianoche sigue abierto de madrugada', () => {
    const hours: OpeningHours = {
      ...base,
      weekly: { ...base.weekly, tue: [{ start: '18:00', end: '02:00' }] },
    };
    expect(isOpenAt(at(TUE_NORMAL, 23, 30), hours)).toBe(true);
    expect(isOpenAt(at('2026-07-15', 1, 0), hours)).toBe(true); // miércoles 1 am
    expect(isOpenAt(at('2026-07-15', 2, 0), hours)).toBe(false); // ya cerró
    expect(isOpenAt(at(TUE_NORMAL, 17, 59), hours)).toBe(false);
  });

  it('el hueco entre dos rangos del mismo día está cerrado', () => {
    const hours: OpeningHours = {
      ...base,
      weekly: {
        ...base.weekly,
        wed: [
          { start: '12:00', end: '15:00' },
          { start: '18:00', end: '23:00' },
        ],
      },
    };
    expect(isOpenAt(at('2026-07-15', 13), hours)).toBe(true);
    expect(isOpenAt(at('2026-07-15', 16), hours)).toBe(false);
    expect(isOpenAt(at('2026-07-15', 19), hours)).toBe(true);
  });
});

describe('nextOpenAt', () => {
  const at = (date: string, h: number, m = 0) => {
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(y!, mo! - 1, d!, h, m);
  };

  it('desde un lunes cerrado devuelve el martes a las 17:00', () => {
    expect(nextOpenAt(at(MON_NORMAL, 12), base)).toEqual(at(TUE_NORMAL, 17));
  });

  it('antes de abrir devuelve la apertura de hoy mismo', () => {
    expect(nextOpenAt(at(TUE_NORMAL, 9), base)).toEqual(at(TUE_NORMAL, 17));
  });

  it('ya cerrado de noche devuelve el día siguiente', () => {
    expect(nextOpenAt(at(TUE_NORMAL, 23, 30), base)).toEqual(at('2026-07-15', 17));
  });

  it('salta el descanso corrido al martes por el lunes festivo', () => {
    // Cerrado el martes 21 (descanso corrido) → la próxima es el miércoles 22.
    expect(nextOpenAt(at(TUE_AFTER_HOLIDAY, 10), base)).toEqual(at('2026-07-22', 17));
  });

  it('devuelve null si nunca abre', () => {
    const never: OpeningHours = {
      weekly: EMPTY_WEEKLY,
      overrides: [],
      restDayHolidayShift: false,
    };
    expect(nextOpenAt(at(TUE_NORMAL, 10), never)).toBeNull();
  });
});

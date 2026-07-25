import { describe, expect, it, vi } from 'vitest';
import {
  formatCop,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  groupDigits,
  onlyDigits,
  pluralizeUnit,
} from './format';

/**
 * Estos formatters se ven en TODA pantalla: recibos, arqueos, reportes, la web
 * pública. Mutantes que estos tests matan:
 * - un monto nulo renderizado como "$0" en vez de "—" (el cajero lee "cero
 *   vendido" donde en realidad no hay dato).
 * - una fecha-solo `YYYY-MM-DD` corrida un día en Bogotá (UTC-5): el cierre del
 *   30 aparecería como 29 en todos los reportes.
 * - separadores de miles perdidos: "100000" vs "100.000" a la hora de cobrar.
 */

/** El es-CO de Intl usa espacio duro (NBSP/NNBSP) tras el "$" y antes del "%". */
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

describe('formatCop', () => {
  it('formatea pesos con separador de miles y sin decimales', () => {
    expect(norm(formatCop(1_450_000))).toBe('$ 1.450.000');
  });

  it('acepta el monto como string (viene así de los inputs)', () => {
    expect(norm(formatCop('20000'))).toBe('$ 20.000');
  });

  it('sin dato muestra "—", NO "$0"', () => {
    expect(formatCop(null)).toBe('—');
    expect(formatCop(undefined)).toBe('—');
    expect(formatCop('')).toBe('—');
  });

  it('un string no numérico muestra "—" en vez de "$NaN"', () => {
    expect(formatCop('abc')).toBe('—');
    expect(formatCop(Number.NaN)).toBe('—');
    expect(formatCop(Infinity)).toBe('—');
  });

  it('el CERO real sí se muestra (declarar $0 ≠ no tener dato)', () => {
    expect(norm(formatCop(0))).toBe('$ 0');
  });

  it('formatea negativos (descuadres, ajustes)', () => {
    expect(norm(formatCop(-15_000))).toContain('15.000');
    expect(formatCop(-15_000)).toMatch(/-/);
  });

  it('withSymbol=false omite el "$" pero conserva los miles', () => {
    expect(norm(formatCop(20_000, { withSymbol: false }))).toBe('20.000');
  });

  it('redondea los decimales (COP es entero)', () => {
    expect(norm(formatCop(1999.6))).toBe('$ 2.000');
  });
});

describe('onlyDigits / groupDigits', () => {
  it('onlyDigits descarta todo lo que no sea dígito', () => {
    expect(onlyDigits('$ 100.000 COP')).toBe('100000');
    expect(onlyDigits('abc')).toBe('');
  });

  it('groupDigits arma los puntos de miles', () => {
    expect(groupDigits('100000')).toBe('100.000');
    expect(groupDigits('1')).toBe('1');
    expect(groupDigits('1000')).toBe('1.000');
    expect(groupDigits('1234567')).toBe('1.234.567');
  });

  it('groupDigits recorta ceros a la izquierda', () => {
    expect(groupDigits('000100')).toBe('100');
  });

  it('el cero solo sobrevive (el usuario tecleando "0")', () => {
    expect(groupDigits('0')).toBe('0');
  });

  it('cadena vacía o basura → vacío', () => {
    expect(groupDigits('')).toBe('');
    expect(groupDigits('abc')).toBe('');
  });

  it('es idempotente sobre un valor ya agrupado', () => {
    expect(groupDigits(groupDigits('1234567'))).toBe('1.234.567');
  });
});

describe('formatNumber', () => {
  it('por defecto es entero', () => {
    expect(formatNumber(1500)).toBe('1.500');
  });

  it('`decimals` fija la cantidad (muestra ceros)', () => {
    expect(formatNumber(1.5, { decimals: 3 })).toBe('1,500');
  });

  it('`maxDecimals` recorta los ceros al final', () => {
    expect(formatNumber(1000, { maxDecimals: 4 })).toBe('1.000');
    expect(formatNumber(1.5, { maxDecimals: 4 })).toBe('1,5');
    expect(formatNumber(0.001, { maxDecimals: 4 })).toBe('0,001');
  });

  it('sin dato muestra "—"', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  it('el 0 se muestra', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('recibe el valor YA en % (no en 0..1)', () => {
    expect(norm(formatPercent(15.6))).toBe('15,6 %');
  });

  it('un decimal por defecto', () => {
    expect(norm(formatPercent(50))).toBe('50,0 %');
    expect(norm(formatPercent(50, { decimals: 0 }))).toBe('50 %');
  });

  it('withSign antepone "+" solo a los positivos', () => {
    expect(norm(formatPercent(12, { withSign: true }))).toBe('+12,0 %');
    expect(norm(formatPercent(-12, { withSign: true }))).toBe('-12,0 %');
    expect(norm(formatPercent(0, { withSign: true }))).toBe('0,0 %');
  });

  it('sin dato muestra "—"', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('pluralizeUnit', () => {
  it('los símbolos de medida son invariables', () => {
    for (const u of ['g', 'kg', 'ml', 'l', 'oz', 'lb']) {
      expect(pluralizeUnit(u, 5), u).toBe(u);
      expect(pluralizeUnit(u, 1), u).toBe(u);
    }
  });

  it('reconoce el símbolo sin importar mayúsculas', () => {
    expect(pluralizeUnit('KG', 5)).toBe('KG');
  });

  it('pluraliza palabras terminadas en vocal', () => {
    expect(pluralizeUnit('taza', 3)).toBe('tazas');
    expect(pluralizeUnit('taza', 1)).toBe('taza');
  });

  it('pluraliza consonante con -es', () => {
    expect(pluralizeUnit('unidad', 2)).toBe('unidades');
  });

  it('resuelve el acento de -ón', () => {
    expect(pluralizeUnit('porción', 2)).toBe('porciones');
  });

  it('convierte la z final en -ces', () => {
    expect(pluralizeUnit('nuez', 3)).toBe('nueces');
  });

  it('no re-pluraliza lo que ya termina en s', () => {
    expect(pluralizeUnit('papas', 3)).toBe('papas');
  });

  it('una unidad vacía o numérica (dato sucio) cae a unidad/unidades', () => {
    expect(pluralizeUnit('', 1)).toBe('unidad');
    expect(pluralizeUnit(null, 5)).toBe('unidades');
    expect(pluralizeUnit('2', 5)).toBe('unidades');
    expect(pluralizeUnit('1,5', 1)).toBe('unidad');
  });

  it('la cantidad negativa se juzga por su valor absoluto', () => {
    expect(pluralizeUnit('unidad', -1)).toBe('unidad');
    expect(pluralizeUnit('unidad', -3)).toBe('unidades');
  });

  it('el 0 va en plural (0 unidades)', () => {
    expect(pluralizeUnit('unidad', 0)).toBe('unidades');
  });
});

describe('formatDate', () => {
  it('una fecha-solo NO se corre un día en Bogotá (UTC-5)', () => {
    // Si se parseara como medianoche UTC, en UTC-5 mostraría el 29.
    expect(formatDate('2026-06-30', 'short')).toMatch(/30/);
  });

  it('short: día, mes abreviado y año', () => {
    const out = formatDate('2026-05-04', 'short');
    expect(out).toMatch(/04/);
    expect(out).toMatch(/2026/);
  });

  it('long incluye el día de la semana', () => {
    expect(formatDate('2026-05-04', 'long').toLowerCase()).toMatch(/lunes/);
  });

  it('time-short usa reloj de 24 h', () => {
    expect(formatDate(new Date(2026, 4, 4, 14, 32), 'time-short')).toBe('14:32');
  });

  it('time incluye los segundos', () => {
    expect(formatDate(new Date(2026, 4, 4, 14, 32, 18), 'time')).toBe('14:32:18');
  });

  it('datetime junta fecha y hora', () => {
    const out = formatDate(new Date(2026, 4, 4, 14, 32), 'datetime');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/14:32/);
  });

  it('acepta un Date igual que un string', () => {
    expect(formatDate(new Date(2026, 4, 4), 'short')).toBe(formatDate('2026-05-04', 'short'));
  });

  it('sin dato o con fecha inválida muestra "—"', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('no es fecha')).toBe('—');
    expect(formatDate(new Date('x'))).toBe('—');
  });
});

describe('formatDate — relativo', () => {
  it('elige la unidad según la distancia (minutos / horas / días)', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    expect(formatDate(new Date(2026, 6, 22, 11, 55), 'relative')).toMatch(/5 minutos/);
    expect(formatDate(new Date(2026, 6, 22, 10, 0), 'relative')).toMatch(/2 horas/);
    // `numeric: 'auto'` usa la forma coloquial cuando existe.
    expect(formatDate(new Date(2026, 6, 20, 12, 0), 'relative')).toBe('anteayer');
    vi.useRealTimers();
  });

  it('distingue el pasado del futuro', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    expect(formatDate(new Date(2026, 6, 22, 14, 0), 'relative')).toMatch(/dentro de 2 horas/);
    expect(formatDate(new Date(2026, 6, 22, 10, 0), 'relative')).toMatch(/hace 2 horas/);
    vi.useRealTimers();
  });

  it('escala a meses y años', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    expect(formatDate(new Date(2026, 2, 22, 12, 0), 'relative')).toMatch(/meses/);
    expect(formatDate(new Date(2024, 6, 22, 12, 0), 'relative')).toMatch(/años/);
    vi.useRealTimers();
  });

  it('menos de un minuto usa segundos', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 6, 22, 12, 0, 30));
    expect(formatDate(new Date(2026, 6, 22, 12, 0, 0), 'relative')).toMatch(/30 s/);
    vi.useRealTimers();
  });
});

describe('formatDuration', () => {
  it('mm:ss por debajo de una hora', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('h:mm:ss a partir de una hora', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_600_000 + 125_000)).toBe('1:02:05');
  });

  it('valores inválidos o negativos caen a 0:00 (nunca "NaN:NaN")', () => {
    expect(formatDuration(-1)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });

  it('trunca los milisegundos sueltos hacia abajo', () => {
    expect(formatDuration(1_999)).toBe('0:01');
  });
});

import { describe, expect, it } from 'vitest';
import {
  VIGENCIA_MS,
  borradorUtilizable,
  cuantosContados,
  haceCuanto,
  soloItemsVigentes,
} from './borrador-conteo';

const AHORA = new Date('2026-09-04T15:00:00Z').getTime();

describe('cuantosContados', () => {
  it('cuenta solo lo que tiene algo escrito', () => {
    expect(cuantosContados({ a: '12', b: '', c: '  ', d: '0' })).toBe(2);
  });

  it('el cero SÍ cuenta: "no queda ninguno" es un dato', () => {
    expect(cuantosContados({ a: '0' })).toBe(1);
  });
});

describe('borradorUtilizable', () => {
  it('un conteo reciente con datos se puede retomar', () => {
    expect(borradorUtilizable({ valores: { a: '5' }, guardadoEn: AHORA - 60_000 }, AHORA)).toBe(true);
  });

  it('sin datos no se ofrece retomar nada', () => {
    expect(borradorUtilizable({ valores: {}, guardadoEn: AHORA }, AHORA)).toBe(false);
    expect(borradorUtilizable({ valores: { a: '' }, guardadoEn: AHORA }, AHORA)).toBe(false);
  });

  it('pasadas 12 horas ya es de otra jornada y no se retoma', () => {
    const viejo = { valores: { a: '5' }, guardadoEn: AHORA - VIGENCIA_MS - 1 };
    expect(borradorUtilizable(viejo, AHORA)).toBe(false);
    // Justo en el borde todavía sirve.
    expect(borradorUtilizable({ ...viejo, guardadoEn: AHORA - VIGENCIA_MS + 1 }, AHORA)).toBe(true);
  });

  it('un reloj adelantado no invalida lo que ya se contó', () => {
    expect(borradorUtilizable({ valores: { a: '5' }, guardadoEn: AHORA + 60_000 }, AHORA)).toBe(true);
  });

  it('sin borrador, nada que retomar', () => {
    expect(borradorUtilizable(null, AHORA)).toBe(false);
  });
});

describe('soloItemsVigentes', () => {
  it('descarta lo que ya no está en el catálogo', () => {
    // Un insumo desactivado entre que se empezó y se retomó: enviarlo daría un
    // error del servidor que el cocinero no puede resolver.
    expect(soloItemsVigentes({ a: '1', viejo: '9' }, ['a', 'b'])).toEqual({ a: '1' });
  });

  it('si todo sigue vigente no toca nada', () => {
    expect(soloItemsVigentes({ a: '1', b: '2' }, ['a', 'b'])).toEqual({ a: '1', b: '2' });
  });
});

describe('haceCuanto', () => {
  it('dice el tiempo en palabras, para saber si es de esta jornada', () => {
    expect(haceCuanto(AHORA - 30_000, AHORA)).toBe('hace un momento');
    expect(haceCuanto(AHORA - 60_000, AHORA)).toBe('hace 1 minuto');
    expect(haceCuanto(AHORA - 25 * 60_000, AHORA)).toBe('hace 25 minutos');
    expect(haceCuanto(AHORA - 60 * 60_000, AHORA)).toBe('hace 1 hora');
    expect(haceCuanto(AHORA - 3 * 60 * 60_000, AHORA)).toBe('hace 3 horas');
  });

  it('un guardado en el futuro no dice un disparate', () => {
    expect(haceCuanto(AHORA + 60_000, AHORA)).toBe('hace un momento');
  });
});

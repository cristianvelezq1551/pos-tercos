import { describe, expect, it } from 'vitest';
import {
  computeCashierBaseline,
  flagsForShift,
  DISCREPANCY_THRESHOLD_COP,
  MIN_BASELINE_SAMPLE,
  type ShiftAnomalySample,
} from './cashier-anomalies';

const turno = (
  totalDifference: number | null,
  voidCount = 0,
  noSaleCount = 0,
): ShiftAnomalySample => ({ totalDifference, voidCount, noSaleCount });

const parejos = (n = MIN_BASELINE_SAMPLE) => Array.from({ length: n }, () => turno(0));

describe('computeCashierBaseline', () => {
  it('no inventa un normal con pocos turnos', () => {
    expect(computeCashierBaseline([turno(0), turno(0), turno(0), turno(0)])).toBeNull();
    expect(computeCashierBaseline([])).toBeNull();
  });

  it('un turno sin arquear no mide descuadres, pero sus anulaciones SÍ cuentan', () => {
    // 5 turnos, 4 arqueados: no alcanza para decir qué descuadre es normal,
    // pero las anulaciones son un dato completo y se siguen vigilando.
    const base = computeCashierBaseline([
      turno(0, 0),
      turno(0, 0),
      turno(null, 0),
      turno(0, 0),
      turno(0, 0),
    ])!;
    expect(base).not.toBeNull();
    expect(base.arqueados).toBe(4);
    expect(base.thresholdDiff).toBeNull();
    expect(flagsForShift(turno(900_000), base)).toEqual([]);
    expect(flagsForShift(turno(0, 2), base)).toEqual(['voids_high']);
  });

  it('nunca marca por debajo del umbral de descuadre del negocio', () => {
    const base = computeCashierBaseline(parejos())!;
    expect(base.thresholdDiff).toBe(DISCREPANCY_THRESHOLD_COP);
    expect(flagsForShift(turno(5_000), base)).toEqual([]);
    expect(flagsForShift(turno(5_001), base)).toEqual(['diff_high']);
    expect(flagsForShift(turno(-9_000), base)).toEqual(['diff_high']);
  });

  it('un solo caso enorme no corre lo normal', () => {
    const conOutlier = computeCashierBaseline([
      turno(0),
      turno(500),
      turno(1_000),
      turno(0),
      turno(500),
      turno(228_000),
    ])!;
    const sinOutlier = computeCashierBaseline([
      turno(0),
      turno(500),
      turno(1_000),
      turno(0),
      turno(500),
    ])!;
    expect(conOutlier.typicalDiff).toBe(sinOutlier.typicalDiff);
    expect(flagsForShift(turno(228_000), conOutlier)).toEqual(['diff_high']);
  });

  it('a un cajero que nunca anula, UNA anulación no le marca nada', () => {
    const base = computeCashierBaseline(parejos())!;
    expect(base.thresholdVoids).toBe(1);
    expect(flagsForShift(turno(0, 1), base)).toEqual([]);
    expect(flagsForShift(turno(0, 2), base)).toEqual(['voids_high']);
    expect(flagsForShift(turno(0, 0, 1), base)).toEqual([]);
    expect(flagsForShift(turno(0, 0, 2), base)).toEqual(['noSale_high']);
  });

  it('si anular es habitual, el umbral sube con la persona', () => {
    const base = computeCashierBaseline([
      turno(0, 3),
      turno(0, 3),
      turno(0, 3),
      turno(0, 3),
      turno(0, 3),
    ])!;
    expect(base.typicalVoids).toBe(3);
    expect(flagsForShift(turno(0, 4), base)).toEqual([]);
    expect(flagsForShift(turno(0, 5), base)).toEqual(['voids_high']);
  });

  it('un turno sin arquear no marca por descuadre', () => {
    const base = computeCashierBaseline(parejos())!;
    expect(flagsForShift(turno(null), base)).toEqual([]);
  });

  it('un cajero que SIEMPRE descuadra lo mismo no se marca: esa es su norma', () => {
    // Documenta el límite del detector. Lo que no deja que se lea como "todo
    // bien" es el conteo de turnos sobre el umbral del negocio, que la
    // pantalla muestra aparte.
    const base = computeCashierBaseline([
      turno(50_000),
      turno(50_000),
      turno(50_000),
      turno(50_000),
      turno(50_000),
    ])!;
    expect(base.typicalDiff).toBe(50_000);
    expect(flagsForShift(turno(50_000), base)).toEqual([]);
    expect(flagsForShift(turno(120_000), base)).toEqual(['diff_high']);
  });

  it('el caso real de producción: cuatro faltantes que eran domicilios y un turno que sí se sale', () => {
    // Descuadre TOTAL (cajón + cuenta) de los 8 turnos cerrados de septiembre.
    // Los del 6, 8 y 9 tenían el cajón corto en decenas de miles y la cuenta
    // sobrada por lo mismo: eran domicilios pagados del cajón, no faltantes.
    const septiembre = [
      turno(1_000),
      turno(-2_000),
      turno(0),
      turno(0),
      turno(3_000),
      turno(228_000),
      turno(0),
      turno(0),
    ];
    const base = computeCashierBaseline(septiembre)!;
    const marcados = septiembre.filter((s) => flagsForShift(s, base).length > 0);
    expect(marcados).toHaveLength(1);
    expect(marcados[0]!.totalDifference).toBe(228_000);
  });
});

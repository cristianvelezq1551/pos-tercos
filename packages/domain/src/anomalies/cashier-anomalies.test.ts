import { describe, expect, it } from 'vitest';
import {
  computeCashierBaseline,
  flagsForShift,
  DISCREPANCY_THRESHOLD_COP,
  type ShiftAnomalySample,
} from './cashier-anomalies';

const turno = (totalDifference: number | null, voidCount = 0, noSaleCount = 0): ShiftAnomalySample => ({
  totalDifference,
  voidCount,
  noSaleCount,
});

describe('computeCashierBaseline', () => {
  it('no inventa un normal con pocos turnos', () => {
    expect(computeCashierBaseline([turno(0), turno(0), turno(0), turno(0)])).toBeNull();
  });

  it('los turnos sin arquear no cuentan para medir el descuadre', () => {
    const base = computeCashierBaseline([
      turno(0),
      turno(0),
      turno(null),
      turno(null),
      turno(0),
      turno(0),
      turno(0),
    ]);
    expect(base?.sampleSize).toBe(5);
  });

  it('nunca marca por debajo del umbral de descuadre del negocio', () => {
    const base = computeCashierBaseline([turno(0), turno(0), turno(0), turno(0), turno(0)])!;
    expect(base.thresholdDiff).toBe(DISCREPANCY_THRESHOLD_COP);
    expect(flagsForShift(turno(4_900), base)).toEqual([]);
    expect(flagsForShift(turno(-6_000), base)).toEqual(['diff_high']);
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
    const base = computeCashierBaseline([turno(0), turno(0), turno(0), turno(0), turno(0)])!;
    expect(flagsForShift(turno(0, 1), base)).toEqual([]);
    expect(flagsForShift(turno(0, 2), base)).toEqual(['voids_high']);
  });

  it('un turno sin arquear no marca por descuadre', () => {
    const base = computeCashierBaseline([turno(0), turno(0), turno(0), turno(0), turno(0)])!;
    expect(flagsForShift(turno(null), base)).toEqual([]);
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

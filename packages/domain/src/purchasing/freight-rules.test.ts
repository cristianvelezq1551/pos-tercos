import { describe, expect, it } from 'vitest';
import {
  PCT_FLETE_ALTO,
  fleteEsAlto,
  toleranciaDelTotal,
  totalCuadra,
} from './freight-rules';

describe('toleranciaDelTotal', () => {
  it('en facturas chicas manda el piso, no el porcentaje', () => {
    // 1% de $50.000 son $500: no cubre ni el redondeo del papel.
    expect(toleranciaDelTotal(50_000)).toBe(1000);
  });

  it('en facturas grandes manda el 1%', () => {
    expect(toleranciaDelTotal(500_000)).toBe(5000);
  });
});

describe('totalCuadra', () => {
  it('el total se explica con la mercancía más el domicilio', () => {
    expect(totalCuadra({ total: 208_000, itemsSum: 200_000, freight: 8_000 })).toBe(true);
  });

  it('sin cargar el domicilio, una factura que lo cobra NO cuadra', () => {
    // El caso que motivó el campo: $8.000 sobre $208.000 se pasa de la
    // tolerancia ($2.080) y antes obligaba a inflar el precio de un insumo.
    expect(totalCuadra({ total: 208_000, itemsSum: 200_000, freight: 0 })).toBe(false);
  });

  it('cargar el domicilio DOS veces (campo + ítem) tampoco cuadra', () => {
    expect(totalCuadra({ total: 208_000, itemsSum: 208_000, freight: 8_000 })).toBe(false);
  });

  it('una diferencia de redondeo dentro del piso pasa', () => {
    expect(totalCuadra({ total: 50_400, itemsSum: 50_000, freight: 0 })).toBe(true);
  });
});

describe('fleteEsAlto', () => {
  it('marca a partir del umbral, incluido el borde', () => {
    expect(fleteEsAlto(PCT_FLETE_ALTO)).toBe(true);
    expect(fleteEsAlto(0.087)).toBe(true);
    expect(fleteEsAlto(0.024)).toBe(false);
  });

  it('sin compras no hay porcentaje que juzgar', () => {
    // Sin esto, `null >= 0.05` sería false por casualidad y no por decisión.
    expect(fleteEsAlto(null)).toBe(false);
  });
});

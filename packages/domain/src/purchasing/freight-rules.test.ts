import { describe, expect, it } from 'vitest';
import {
  DIFERENCIA_VISIBLE_COP,
  PCT_FLETE_ALTO,
  fleteEsAlto,
  toleranciaDelTotal,
  totalCuadra,
} from './freight-rules';

describe('toleranciaDelTotal', () => {
  it('en facturas chicas manda el piso, no el porcentaje', () => {
    // 0,3% de $50.000 son $150: no cubre ni el redondeo del papel.
    expect(toleranciaDelTotal(50_000)).toBe(500);
  });

  it('en facturas grandes manda el porcentaje', () => {
    expect(toleranciaDelTotal(500_000)).toBe(1500);
  });

  /**
   * El caso que hizo bajar la tolerancia (2026-08-29): una factura REAL de
   * Postobón de 16 líneas, leída por la IA, quedó $1.200 por debajo de su
   * total —una línea mal transcrita— y el control la aceptaba, porque el 1%
   * de $398.466 daba casi $4.000 de margen. El flete tiene campo propio desde
   * §7.v31, así que la tolerancia ya no tiene que absorberlo: solo el redondeo.
   */
  it('atrapa el error de $1.200 de la factura real que lo motivó', () => {
    const total = 398_466.57;
    expect(toleranciaDelTotal(total)).toBeLessThan(1200);
    expect(totalCuadra({ total, itemsSum: 397_266.57, freight: 0 })).toBe(false);
  });

  it('pero deja pasar el redondeo de esa misma factura', () => {
    const total = 398_466.57;
    expect(totalCuadra({ total, itemsSum: total - 300, freight: 0 })).toBe(true);
  });
});

describe('DIFERENCIA_VISIBLE_COP', () => {
  /**
   * La tolerancia decide si se puede GUARDAR; este umbral, si se le puede
   * decir al dueño que las cuentas dan. Antes bastaba con estar dentro de la
   * tolerancia para mostrar «Cuadra» en verde, y así una factura a la que le
   * faltaban $1.200 se presentaba como correcta.
   */
  it('un peso de diferencia ya no es "cuadra"', () => {
    expect(DIFERENCIA_VISIBLE_COP).toBeLessThanOrEqual(1);
  });

  it('es MUCHO más estricto que la tolerancia de guardado', () => {
    expect(DIFERENCIA_VISIBLE_COP).toBeLessThan(toleranciaDelTotal(1_000));
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

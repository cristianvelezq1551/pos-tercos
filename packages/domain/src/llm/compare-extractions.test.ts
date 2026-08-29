import { describe, expect, it } from 'vitest';
import type { ExtractedInvoice } from '@pos-tercos/types';
import { compararExtracciones } from './compare-extractions';

/**
 * Los casos vienen de una factura REAL de Postobón leída cuatro veces: el total
 * salió bien las cuatro, el IVA solo una, una línea se leyó mal en todas, y una
 * corrida erró $10 —que pasa por debajo de cualquier tolerancia—. El caso más
 * peligroso es el de la CANTIDAD: si el total de la línea se lee bien, la suma
 * cuadra y no hay control aritmético que lo vea.
 */

const item = (over: Partial<ExtractedInvoice['items'][number]> = {}) => ({
  descriptionRaw: 'ACQUA POSTOBON SANDIA PET 400 ML X 15',
  quantity: 15,
  unit: 'PZA',
  unitPrice: 1053.22,
  total: 18799.98,
  packUnits: null,
  packSizePerUnit: null,
  packSizeMeasure: null,
  ...over,
});

const factura = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  supplierName: 'POSTOBON S.A.',
  supplierNit: '890903939',
  invoiceNumber: 'IT081858285',
  total: 398466.57,
  iva: 63620.71,
  freight: null,
  items: [item()],
  warnings: [],
  ...over,
});

describe('compararExtracciones', () => {
  it('dos lecturas idénticas no generan ningún aviso', () => {
    expect(compararExtracciones(factura(), factura())).toEqual([]);
  });

  it('detecta el IVA distinto — falló en 3 de 4 corridas reales', () => {
    const avisos = compararExtracciones(factura(), factura({ iva: 63527.71 }));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('IVA');
    expect(avisos[0]).toContain('63.620,71');
    expect(avisos[0]).toContain('63.527,71');
  });

  it('detecta el error de $10 que ninguna tolerancia atrapa', () => {
    const avisos = compararExtracciones(
      factura({ items: [item()] }),
      factura({ items: [item({ total: 18789.98 })] }),
    );
    expect(avisos.some((a) => a.includes('Línea 1') && a.includes('total'))).toBe(true);
  });

  it('detecta la CANTIDAD distinta, que no cambia ninguna suma', () => {
    const avisos = compararExtracciones(
      factura({ items: [item({ quantity: 15 })] }),
      factura({ items: [item({ quantity: 16 })] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('CANTIDAD');
    // El aviso explica POR QUÉ importa: es el error que las sumas no ven.
    expect(avisos[0]).toContain('inventario');
  });

  it('detecta el nombre distinto, que tampoco afecta ninguna suma', () => {
    const avisos = compararExtracciones(
      factura({ items: [item({ descriptionRaw: 'ACQUA POSTOBON SANDIA' })] }),
      factura({ items: [item({ descriptionRaw: 'KOLA POSTOBON SANDIA' })] }),
    );
    expect(avisos.some((a) => a.includes('nombre'))).toBe(true);
  });

  it('ignora diferencias de tildes, mayúsculas y puntuación en los nombres', () => {
    const avisos = compararExtracciones(
      factura({ items: [item({ descriptionRaw: 'Acqua Postobón, 400 ml' })] }),
      factura({ items: [item({ descriptionRaw: 'ACQUA POSTOBON 400 ML' })] }),
    );
    expect(avisos).toEqual([]);
  });

  it('si una lectura ve más líneas que la otra, lo dice y NO compara por posición', () => {
    // Comparar por índice con distinto largo marcaría como distinto todo lo que
    // sigue al renglón que sobra: un solo aviso útil vale más que quince falsos.
    const avisos = compararExtracciones(
      factura({ items: [item(), item()] }),
      factura({ items: [item()] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('2 líneas');
    expect(avisos[0]).toContain('1');
  });

  it('el redondeo de centavos no cuenta como desacuerdo', () => {
    const avisos = compararExtracciones(
      factura({ total: 398466.57 }),
      factura({ total: 398466.58 }),
    );
    expect(avisos).toEqual([]);
  });

  it('un valor que un intento leyó y el otro no, se avisa', () => {
    const avisos = compararExtracciones(factura({ freight: 15000 }), factura({ freight: null }));
    expect(avisos.some((a) => a.includes('domicilio'))).toBe(true);
  });
});

/**
 * Esto corre sobre la salida de un modelo, no sobre datos nuestros: un campo
 * puede llegar AUSENTE aunque el tipo diga `number | null`. Pasó de verdad —
 * una suite vieja con un fake sin `freight` tumbó la carga con un 500.
 */
describe('compararExtracciones — resiste datos incompletos', () => {
  const sinCampos = { items: [], warnings: [] } as unknown as ExtractedInvoice;

  it('no revienta si faltan campos del encabezado', () => {
    expect(() => compararExtracciones(sinCampos, sinCampos)).not.toThrow();
    expect(compararExtracciones(sinCampos, sinCampos)).toEqual([]);
  });

  it('no revienta si falta la lista de líneas', () => {
    const sinItems = { warnings: [] } as unknown as ExtractedInvoice;
    expect(() => compararExtracciones(sinItems, sinItems)).not.toThrow();
  });

  it('un campo ausente en un lado y presente en el otro se avisa, no explota', () => {
    const conIva = factura({ iva: 1000 });
    const sinIva = { ...factura(), iva: undefined } as unknown as ExtractedInvoice;
    expect(compararExtracciones(conIva, sinIva).some((a) => a.includes('IVA'))).toBe(true);
  });

  it('una línea sin descripción no rompe la comparación', () => {
    const a = factura({ items: [{ ...item(), descriptionRaw: undefined } as never] });
    expect(() => compararExtracciones(a, factura())).not.toThrow();
  });
});

/**
 * Probado con la factura real: la primera versión escupía 31 avisos, la mayoría
 * ruido. Un muro de treinta se ignora entero — justo lo contrario de lo que
 * este trabajo busca. Estos dos casos vienen de esa corrida.
 */
describe('compararExtracciones — la señal tiene que ser usable', () => {
  it('el número de renglón del papel no cuenta como nombre distinto', () => {
    // Una lectura trae «1.- KOLA POSTOBON» y la otra «KOLA POSTOBON»: es el
    // mismo nombre. Esto solo marcaba las 16 líneas y tapaba lo importante.
    const avisos = compararExtracciones(
      factura({ items: [item({ descriptionRaw: '1.- KOLA POSTOBON COSTA 250 ML' })] }),
      factura({ items: [item({ descriptionRaw: 'KOLA POSTOBON COSTA 250 ML' })] }),
    );
    expect(avisos).toEqual([]);
  });

  it('cuando media factura discrepa en lo mismo, lo resume en UNA frase', () => {
    const lineas = (t: number) => Array.from({ length: 16 }, () => item({ total: t }));
    const avisos = compararExtracciones(
      factura({ items: lineas(18799.98) }),
      factura({ items: lineas(15798.3) }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('16 líneas');
    // Y nombra la causa probable, que es lo accionable.
    expect(avisos[0]).toContain('otra columna');
  });

  it('pero las CANTIDADES se listan siempre, aunque sean muchas', () => {
    // Son el error que ninguna suma detecta: cada una necesita su línea.
    const a = Array.from({ length: 5 }, () => item({ quantity: 15 }));
    const b = Array.from({ length: 5 }, () => item({ quantity: 16 }));
    const avisos = compararExtracciones(factura({ items: a }), factura({ items: b }));
    expect(avisos).toHaveLength(5);
  });
});

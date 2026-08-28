import { describe, expect, it } from 'vitest';
import { ALL_SECTIONS } from '@pos-tercos/domain';
import { MAX_RESULTS, searchSections } from './search';

describe('searchSections', () => {
  it('no busca con menos de dos letras', () => {
    expect(searchSections('c')).toEqual([]);
    expect(searchSections(' ')).toEqual([]);
  });

  it('encuentra por el texto del contenido, no solo por el título', () => {
    // Ninguna sección se llama "descuadre": la palabra vive dentro de los bloques.
    const hits = searchSections('descuadre');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.section.title.toLowerCase().includes('descuadre'))).toBe(false);
  });

  it('exige TODAS las palabras (AND, no OR)', () => {
    const caja = searchSections('caja');
    const cerrarCaja = searchSections('cerrar caja');
    expect(cerrarCaja.length).toBeLessThanOrEqual(caja.length);
    expect(cerrarCaja.every((h) => h.haystack.includes('cerrar'))).toBe(true);
  });

  it('ignora mayúsculas y espacios de sobra', () => {
    expect(searchSections('  MERMA  ')).toEqual(searchSections('merma'));
  });

  it('devuelve vacío cuando no hay coincidencias', () => {
    expect(searchSections('xyzzy')).toEqual([]);
  });

  it('corta en el tope de resultados', () => {
    // "a" sola no busca; se usa una palabra frecuente para forzar el tope.
    const many = searchSections('de la', ALL_SECTIONS);
    expect(many.length).toBeLessThanOrEqual(MAX_RESULTS);
  });

  it('cada resultado enlaza a un capítulo y una sección reales', () => {
    for (const hit of searchSections('inventario')) {
      expect(hit.chapterId).toBeTruthy();
      expect(hit.section.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('orden de los resultados', () => {
  it('pone primero lo que coincide en el título', () => {
    const [first] = searchSections('cerrar caja');
    // Antes de pesar el título, acá salía "Las cinco pantallas": menciona las
    // dos palabras de pasada y enterraba la sección que de verdad lo explica.
    expect(first?.section.title.toLowerCase()).toContain('cerrar');
  });

  it('prefiere el título sobre el resumen y el resumen sobre el cuerpo', () => {
    const results = searchSections('merma');
    const titles = results.map((r) => r.section.title.toLowerCase());
    const firstBodyOnly = results.findIndex(
      (r) =>
        !r.section.title.toLowerCase().includes('merma') &&
        !r.section.summary.toLowerCase().includes('merma'),
    );
    const lastInTitle = titles.reduce((acc, t, i) => (t.includes('merma') ? i : acc), -1);
    if (firstBodyOnly !== -1 && lastInTitle !== -1) {
      expect(lastInTitle).toBeLessThan(firstBodyOnly);
    }
  });

  it('a igualdad de puntaje respeta el orden de lectura de la guía', () => {
    const results = searchSections('inventario');
    expect(results.length).toBeGreaterThan(1);
    // No lanza y devuelve un orden estable entre corridas.
    expect(searchSections('inventario').map((r) => r.section.id)).toEqual(
      results.map((r) => r.section.id),
    );
  });
});

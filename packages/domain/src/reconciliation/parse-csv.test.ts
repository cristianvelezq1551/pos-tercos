import { describe, expect, it } from 'vitest';
import { parseDateFlexible, parseMoneyCo, parseReconciliationCsv } from './parse-csv';

describe('parseMoneyCo', () => {
  it('separador de miles colombiano: "45.000" son cuarenta y cinco mil', () => {
    expect(parseMoneyCo('45.000')).toBe(45000);
    expect(parseMoneyCo('1.234.567')).toBe(1234567);
  });

  it('miles con decimal coma: "45.000,50"', () => {
    expect(parseMoneyCo('45.000,50')).toBe(45000.5);
  });

  it('estilo US: "45,000.00"', () => {
    expect(parseMoneyCo('45,000.00')).toBe(45000);
  });

  it('literales y símbolos: "$ 28.500", "28500.5", "28500"', () => {
    expect(parseMoneyCo('$ 28.500')).toBe(28500);
    expect(parseMoneyCo('28500.5')).toBe(28500.5);
    expect(parseMoneyCo('28500')).toBe(28500);
  });

  it('decimal con coma sin miles: "45,5"', () => {
    expect(parseMoneyCo('45,5')).toBe(45.5);
  });

  it('signo: menos al inicio o al final (débito bancario)', () => {
    expect(parseMoneyCo('-45.000')).toBe(-45000);
    expect(parseMoneyCo('45.000-')).toBe(-45000); // formato débito "trailing minus"
    expect(parseMoneyCo('-45.000,50')).toBe(-45000.5);
  });

  it('basura → null', () => {
    expect(parseMoneyCo('')).toBeNull();
    expect(parseMoneyCo('N/A')).toBeNull();
    expect(parseMoneyCo('-')).toBeNull();
    expect(parseMoneyCo('1-2')).toBeNull(); // menos en el medio = malformado
  });
});

describe('parseDateFlexible', () => {
  it('ISO y YYYY-MM-DD', () => {
    expect(parseDateFlexible('2026-06-09')?.toISOString()).toContain('2026-06-09');
    expect(parseDateFlexible('2026-06-09T14:30:00Z')?.toISOString()).toBe('2026-06-09T14:30:00.000Z');
  });

  it('DD/MM/YYYY de extractos bancarios (con hora opcional)', () => {
    expect(parseDateFlexible('09/06/2026')?.toISOString()).toBe('2026-06-09T00:00:00.000Z');
    expect(parseDateFlexible('9/6/2026 14:35')?.toISOString()).toBe('2026-06-09T14:35:00.000Z');
  });

  it('inválida → null', () => {
    expect(parseDateFlexible('no es fecha')).toBeNull();
  });
});

describe('parseReconciliationCsv', () => {
  it('CSV simple con comas y orden posicional', () => {
    const rows = parseReconciliationCsv(
      'fecha,monto,referencia\n2026-06-09,28500,NEQ123\n2026-06-09,15000,NEQ124',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.amount).toBe(28500);
    expect(rows[0]!.reference).toBe('NEQ123');
  });

  it('export real: BOM + punto y coma + moneda con miles + DD/MM/YYYY + columnas con alias', () => {
    const rows = parseReconciliationCsv(
      '﻿Fecha Transacción;Valor;Descripción\n09/06/2026;$ 45.000;Pago QR tienda\n10/06/2026;"1.234.567,89";Transferencia',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.amount).toBe(45000);
    expect(rows[0]!.reference).toBe('Pago QR tienda');
    expect(rows[1]!.amount).toBe(1234567.89);
  });

  it('campos entrecomillados con el delimitador adentro', () => {
    const rows = parseReconciliationCsv(
      'fecha,monto,referencia\n2026-06-09,28500,"Pago, con coma"',
    );
    expect(rows[0]!.reference).toBe('Pago, con coma');
  });

  it('columnas en otro orden, mapeadas por header', () => {
    const rows = parseReconciliationCsv(
      'referencia,fecha,monto\nABC,2026-06-09,28.500',
    );
    expect(rows[0]!.amount).toBe(28500);
    expect(rows[0]!.reference).toBe('ABC');
  });

  it('filas corruptas se saltan sin romper el resto', () => {
    const rows = parseReconciliationCsv(
      'fecha,monto,referencia\nbasura,sin,numero\n2026-06-09,28500,OK',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reference).toBe('OK');
  });

  it('vacío o solo header → []', () => {
    expect(parseReconciliationCsv('')).toEqual([]);
    expect(parseReconciliationCsv('fecha,monto,referencia')).toEqual([]);
  });
});

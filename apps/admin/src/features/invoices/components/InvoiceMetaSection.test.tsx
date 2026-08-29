// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * La pantalla donde se confirma una factura es el ÚNICO control real contra un
 * error de lectura de la IA: la tolerancia del servidor es una red para errores
 * grandes, no para uno de $1.200 en una factura de $400.000.
 *
 * Con una factura real de Postobón (16 líneas) la IA leyó una línea $1.200 por
 * debajo, y esta pantalla mostraba «Cuadra.» en verde — le decía al dueño que
 * las cuentas daban. Estos tests fijan que no vuelva a hacerlo.
 */

import { InvoiceMetaSection } from './InvoiceMetaSection';

const props = {
  invoiceNumber: 'IT081858285',
  onInvoiceNumberChange: () => {},
  total: '398466.57',
  onTotalChange: () => {},
  iva: '',
  onIvaChange: () => {},
  freight: '0',
  onFreightChange: () => {},
  notes: '',
  onNotesChange: () => {},
  disabled: false,
};

describe('InvoiceMetaSection — no decir «cuadra» cuando falta plata', () => {
  it('con la diferencia exacta de la factura real, avisa en vez de tranquilizar', () => {
    render(<InvoiceMetaSection {...props} computedItemsTotal={397266.57} />);
    const texto = document.body.textContent ?? '';
    expect(texto).toContain('Faltan');
    expect(texto).not.toContain('Cuadra.');
  });

  it('solo dice «Cuadra» cuando de verdad no falta nada', () => {
    render(<InvoiceMetaSection {...props} computedItemsTotal={398466.57} />);
    expect(document.body.textContent ?? '').toContain('Cuadra.');
  });

  it('una diferencia chica —dentro de lo que el servidor acepta— igual se muestra', () => {
    // $300 pasa el control de guardado, pero el dueño tiene derecho a verlo.
    render(<InvoiceMetaSection {...props} computedItemsTotal={398166.57} />);
    const texto = document.body.textContent ?? '';
    expect(texto).toContain('Faltan');
    expect(texto).toContain('Se puede guardar');
  });

  it('si los ítems suman de más, lo dice al revés', () => {
    render(<InvoiceMetaSection {...props} computedItemsTotal={399466.57} />);
    expect(document.body.textContent ?? '').toContain('de más');
  });
});

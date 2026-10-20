import { describe, it, expect } from "vitest";
import { renderComandaEscPos, type ComandaData } from "./render-comanda";
import { renderReceiptEscPos } from "./render-escpos";
import { truncate, wrapWithPrefix } from "./escpos-text";
import type { ReceiptData } from "./types";
import { lineasVisibles } from "./lineas-visibles.test-util";

/**
 * La línea del producto se cortaba a 32 con "…", que en latin1 sale como "&":
 * la cocina recibía "2x Papas TERCOS Pollo y Miel ah&" y el cliente lo mismo
 * en su recibo. Ahora se PARTE por palabras.
 *
 * Lo que NO puede cambiar: un papel donde todo cabe. Los bytes de abajo se
 * generaron con el renderizador ANTERIOR al arreglo (main 8f642fa) — si
 * alguno de estos tests falla, el cambio movió un papel que ya funcionaba.
 */
const GOLDEN = {
  "comanda": "G0AbYQEbRQEqKiogQ09NQU5EQSBDT0NJTkEgKioqG0UAChtFASoqKiBSRUlNUFJFU0nTTiAqKiobRQAKHSERG0UBUEVESURPICM0MhtFAB0hAAodIQEbRQEqKiogRE9NSUNJTElPICoqKhtFAB0hAAo0LzUsIDEwOjMwIGEuoG0uCkNsaWVudGU6IEFuYSBNYXLtYQobYQAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQobRQFFTlRSRUdBUiBFTjobRQAKHSEBQ3JhIDQzQSAjNS0xNSwgdG9ycmUgMiwgYXB0byA1MDIKHSEAcG9ydGVy7WEKG0UBVGVsOiArNTczMDAxMjM0NTY3G0UACi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCh0hARtFATJ4IEJ1cmdlciBOYXNodmlsbGUbRQAdIQAKICAgKyBUb2NpbmV0YQogICArIFNpbiBwZXBpbmlsbG8KG0UBKiBzaW4gY2Vib2xsYQobRQAdIQEbRQExeCAyIFBhcGFzIGNvbiBwb2xsbxtFAB0hAAogICAtIDJ4IFBhcGFzIFRFUkNPUyBQb2xsbyB5CiAgICAgTWllbCBhaHVtYWRhCiAgICsgMiBDb2NhLUNvbGEKHSEBG0UBMXggUGFwYXMgVEVSQ09TIE1peHRvG0UAHSEACi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCgobYQEbRQFUZXJjb3MbRQAbYQAKCgoKCgodVgE=",
  "cancelada": "G0AbYQEbRQEdIREqKiogQU5VTEFSICoqKgodIQBERVNDQVJUQVIgRVNURSBQRURJRE8bRQAKG0UBKioqIFJFSU1QUkVTSdNOICoqKhtFAAodIREbRQFQRURJRE8gIzQyG0UAHSEACh0hARtFASoqKiBET01JQ0lMSU8gKioqG0UAHSEACjQvNSwgMTA6MzAgYS6gbS4KQ2xpZW50ZTogQW5hIE1hcu1hChthAC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tChtFAUVOVFJFR0FSIEVOOhtFAAodIQFDcmEgNDNBICM1LTE1LCB0b3JyZSAyLCBhcHRvIDUwMgodIQBwb3J0ZXLtYQobRQFUZWw6ICs1NzMwMDEyMzQ1NjcbRQAKLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KHSEBG0UBMnggQnVyZ2VyIE5hc2h2aWxsZRtFAB0hAAogICArIFRvY2luZXRhCiAgICsgU2luIHBlcGluaWxsbwobRQEqIHNpbiBjZWJvbGxhChtFAB0hARtFATF4IDIgUGFwYXMgY29uIHBvbGxvG0UAHSEACiAgIC0gMnggUGFwYXMgVEVSQ09TIFBvbGxvIHkKICAgICBNaWVsIGFodW1hZGEKICAgKyAyIENvY2EtQ29sYQodIQEbRQExeCBQYXBhcyBURVJDT1MgTWl4dG8bRQAdIQAKLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KChthARtFAVRlcmNvcxtFABthAAoKCgoKCh1WAQ==",
  "recibo": "G0AbYQEdIREbRQFUZXJjb3MKG0UAHSEAQ3JhIDQzQSAjIDExLTEyCk5JVCA5MDAuMTIzLjQ1Ni03ClRlbDogKzU3IDMwMCAxMjMgNDU2NwoKG2EAG0UBUkVDSUJPICM0MhtFAAowNC8wNS8yMDI2LCAxMDozMCBhLqBtLgpDYWplcm86IEp1YW4KQ2xpZW50ZTogQW5hCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCjJ4IEJ1cmdlciBOYXNodmlsbGUKICArIFRvY2luZXRhCiAgJDE4LjAwMCAgICAgICAgICAgICAgICAkMzYuMDAwCiAgcHJvbW8gTWFydGVzICAgICAgICAgICAtJDMuNjAwCjF4IFBhcGFzIFRFUkNPUyBNaXh0bwogICQyOS4wMDAgICAgICAgICAgICAgICAgJDI5LjAwMAotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQpTdWJ0b3RhbCAgICAgICAgICAgICAgICAgJDY1LjAwMApEZXNjdWVudG9zICAgICAgICAgICAgICAgLSQzLjYwMApEb21pY2lsaW8gICAgICAgICAgICAgICAgICQ1LjAwMAobRQEdIQFUT1RBTCAgICAkNjEuNDAwHSEAG0UACgobYQGhR3JhY2lhcyBwb3IgdHUgY29tcHJhIQoKCgoKCgodVgE="
};

const COMANDA: ComandaData = {
  receiptNumber: 42,
  createdAt: "2026-05-04T15:30:00.000Z",
  type: "WEB_DELIVERY",
  customerName: "Ana María",
  deliveryAddress: "Cra 43A #5-15, torre 2, apto 502",
  deliveryNotes: "portería",
  customerPhone: "+573001234567",
  items: [
    { productName: "Burger Nashville", sizeName: null, quantity: 2, modifiers: ["Tocineta", "Sin pepinillo"], notes: "sin cebolla" },
    { productName: "2 Papas con pollo", sizeName: null, quantity: 1, components: ["2x Papas TERCOS Pollo y Miel ahumada"], modifiers: ["2 Coca-Cola"], notes: null },
    { productName: "Papas TERCOS", sizeName: "Mixto", quantity: 1, modifiers: [], notes: null },
  ],
  reprintLabel: "REIMPRESIÓN",
  footer: "Tercos",
};

const RECIBO: ReceiptData = {
  receiptNumber: 42,
  createdAt: "2026-05-04T15:30:00.000Z",
  cashierName: "Juan",
  customerName: "Ana",
  items: [
    { productName: "Burger Nashville", sizeName: null, quantity: 2, unitPrice: 18000, lineSubtotal: 36000, lineDiscount: 3600, lineTotal: 32400, appliedPromotionName: "Martes", modifiers: [{ name: "Tocineta" }] },
    { productName: "Papas TERCOS", sizeName: "Mixto", quantity: 1, unitPrice: 29000, lineSubtotal: 29000, lineDiscount: 0, lineTotal: 29000, appliedPromotionName: null, modifiers: [] },
  ],
  subtotal: 65000,
  discountTotal: 3600,
  total: 61400,
  deliveryFee: 5000,
  reprintLabel: null,
  business: { name: "Tercos", address: "Cra 43A # 11-12", nit: "900.123.456-7", phone: "+57 300 123 4567" },
} as ReceiptData;

describe("papeles donde todo cabe: idénticos byte por byte a los de antes", () => {
  it("comanda (domicilio, extras, nota, combo con componentes, variante)", () => {
    expect(renderComandaEscPos(COMANDA).toString("base64")).toBe(GOLDEN.comanda);
  });
  it("ticket de anulación", () => {
    expect(renderComandaEscPos({ ...COMANDA, cancelled: true }).toString("base64")).toBe(GOLDEN.cancelada);
  });
  it("recibo del cliente (promo, extras, domicilio)", () => {
    expect(renderReceiptEscPos(RECIBO).toString("base64")).toBe(GOLDEN.recibo);
  });
});

const LARGO = { productName: "Papas TERCOS", sizeName: "Pollo y Miel ahumada", quantity: 2 };

describe("la línea del producto se parte, no se corta", () => {
  const comanda = (item: Partial<ComandaData["items"][number]>) =>
    renderComandaEscPos({ ...COMANDA, items: [{ ...LARGO, modifiers: [], notes: null, ...item }] }).toString("latin1");

  it("la comanda trae la variante entera y sin \"&\"", () => {
    const lineas = lineasVisibles(comanda({}));
    const i = lineas.findIndex((l) => l.startsWith("2x Papas TERCOS"));
    expect(lineas[i]).toBe("2x Papas TERCOS Pollo y Miel");
    expect(lineas[i + 1]).toBe("   ahumada");
    expect(lineas.join("\n")).not.toContain("&");
  });

  it("cada renglón del producto va en doble alto y negrita, igual que antes", () => {
    const papel = comanda({});
    for (const pedazo of ["2x Papas TERCOS Pollo y Miel", "   ahumada"]) {
      const antes = papel.slice(0, papel.indexOf(pedazo));
      expect(antes.endsWith("\x1d\x21\x01\x1b\x45\x01"), pedazo).toBe(true);
    }
  });

  it("un extra largo también se parte con sangría", () => {
    const lineas = lineasVisibles(comanda({ ...LARGO, productName: "Burger", sizeName: null, modifiers: ["Doble tocineta premium ahumada en casa"] }));
    const i = lineas.findIndex((l) => l.startsWith("   + "));
    expect(lineas[i]).toBe("   + Doble tocineta premium");
    expect(lineas[i + 1]).toBe("     ahumada en casa");
  });

  it("ninguna línea de la comanda pasa de 32", () => {
    for (const l of lineasVisibles(comanda({}))) expect(l.length, l).toBeLessThanOrEqual(32);
  });

  it("el recibo del cliente también trae la variante entera", () => {
    const papel = renderReceiptEscPos({
      ...RECIBO,
      items: [{ ...RECIBO.items[1]!, ...LARGO, modifiers: [] }],
    }).toString("latin1");
    const lineas = lineasVisibles(papel);
    const i = lineas.findIndex((l) => l.startsWith("2x Papas TERCOS"));
    expect(lineas[i]).toBe("2x Papas TERCOS Pollo y Miel");
    expect(lineas[i + 1]).toBe("   ahumada");
    for (const l of lineas) expect(l.length, l).toBeLessThanOrEqual(32);
    expect(papel).not.toContain("&");
  });
});

describe("helpers de texto", () => {
  it("truncate corta con un punto ASCII: \"…\" salía como \"&\" en latin1", () => {
    const corto = truncate("Cliente: Maria Fernanda Rodriguez Velez", 32);
    expect(corto).toHaveLength(32);
    expect(corto.endsWith(".")).toBe(true);
    expect(Buffer.from(corto, "latin1").toString("latin1")).toBe(corto);
  });

  it("wrapWithPrefix deja igual lo que cabe y sangra lo que no", () => {
    expect(wrapWithPrefix("2x ", "Burger", 32)).toEqual(["2x Burger"]);
    expect(wrapWithPrefix("2x ", "Papas TERCOS Pollo y Miel ahumada", 32)).toEqual(["2x Papas TERCOS Pollo y Miel", "   ahumada"]);
  });
});

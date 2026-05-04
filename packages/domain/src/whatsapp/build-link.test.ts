/**
 * Tests de los builders wa.me. Migrado a Vitest en FASE 14.E.
 * Ejecutar con `pnpm -F @pos-tercos/domain test`.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAcceptedLink,
  buildConfirmedLink,
  buildLinkForStage,
  buildReadyLink,
} from './build-link';
import type { WhatsAppSaleSnapshot } from './types';

const OPTS = {
  businessName: 'Tercos',
  businessAddressShort: 'Cra 43A # 11-12, Medellín',
};

const SALE_PICKUP: WhatsAppSaleSnapshot = {
  receiptNumber: 42,
  customerName: 'Juan Pérez',
  customerPhone: '+573001234567',
  total: 25500,
  type: 'WEB_PICKUP',
};

const SALE_DELIVERY: WhatsAppSaleSnapshot = {
  ...SALE_PICKUP,
  type: 'WEB_DELIVERY',
};

function eq(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}
function truthy(v: unknown, msg: string): void {
  expect(v, msg).toBeTruthy();
}
function contains(haystack: string, needle: string): void {
  expect(haystack).toContain(needle);
}

describe('whatsapp build-link', () => {

// PHONE NORMALIZATION
it('phone +57 prefix → solo dígitos en URL', () => {
  const r = buildAcceptedLink(SALE_PICKUP, OPTS);
  truthy(r, 'link not null');
  eq(r!.url.startsWith('https://wa.me/573001234567?text='), true);
});

it('phone con espacios y dashes → normaliza', () => {
  const r = buildAcceptedLink(
    { ...SALE_PICKUP, customerPhone: '+57 300 123-4567' },
    OPTS,
  );
  eq(r!.url.startsWith('https://wa.me/573001234567?'), true);
});

it('phone sin país (10 dígitos) → prepend 57', () => {
  const r = buildAcceptedLink(
    { ...SALE_PICKUP, customerPhone: '3001234567' },
    OPTS,
  );
  eq(r!.url.startsWith('https://wa.me/573001234567?'), true);
});

it('phone null → devuelve null (no link)', () => {
  const r = buildAcceptedLink(
    { ...SALE_PICKUP, customerPhone: null },
    OPTS,
  );
  eq(r, null);
});

it('phone con menos de 10 dígitos → null', () => {
  const r = buildAcceptedLink(
    { ...SALE_PICKUP, customerPhone: '+571234' },
    OPTS,
  );
  eq(r, null);
});

// GREETING
it('customerName con apellido → solo primer nombre', () => {
  const r = buildAcceptedLink(SALE_PICKUP, OPTS);
  contains(r!.messagePlain, 'Hola Juan,');
});

it('customerName null → "Hola"', () => {
  const r = buildAcceptedLink(
    { ...SALE_PICKUP, customerName: null },
    OPTS,
  );
  contains(r!.messagePlain, 'Hola, ');
});

it('customerName vacío → "Hola"', () => {
  const r = buildAcceptedLink(
    { ...SALE_PICKUP, customerName: '   ' },
    OPTS,
  );
  contains(r!.messagePlain, 'Hola, ');
});

// ACCEPTED MESSAGE
it('accepted incluye número de pedido + total + nombre del local', () => {
  const r = buildAcceptedLink(SALE_PICKUP, OPTS);
  contains(r!.messagePlain, '#42');
  contains(r!.messagePlain, '$25.500');
  contains(r!.messagePlain, 'Tercos');
  contains(r!.messagePlain, 'comprobante');
});

// CONFIRMED MESSAGE
it('confirmed incluye check + nombre del local', () => {
  const r = buildConfirmedLink(SALE_PICKUP, OPTS);
  contains(r!.messagePlain, '#42');
  contains(r!.messagePlain, '✅');
  contains(r!.messagePlain, 'cocina');
  contains(r!.messagePlain, 'Tercos');
});

// READY: PICKUP vs DELIVERY
it('ready PICKUP incluye dirección', () => {
  const r = buildReadyLink(SALE_PICKUP, OPTS);
  contains(r!.messagePlain, 'listo para retirar');
  contains(r!.messagePlain, 'Cra 43A # 11-12, Medellín');
});

it('ready PICKUP sin dirección → omite "Te esperamos"', () => {
  const r = buildReadyLink(SALE_PICKUP, {
    businessName: 'Tercos',
    businessAddressShort: null,
  });
  contains(r!.messagePlain, 'listo para retirar');
  if (r!.messagePlain.includes('Te esperamos')) {
    throw new Error('ready PICKUP sin dirección no debería decir "Te esperamos"');
  }
});

it('ready DELIVERY dice "salió a entrega"', () => {
  const r = buildReadyLink(SALE_DELIVERY, OPTS);
  contains(r!.messagePlain, 'salió a entrega');
  contains(r!.messagePlain, '~20 min');
});

// URL ENCODING
it('mensaje con espacios y # se encodea correctamente', () => {
  const r = buildAcceptedLink(SALE_PICKUP, OPTS);
  contains(r!.url, '%20');
  contains(r!.url, '%23'); // # encoded
});

// DISPATCHER
it('buildLinkForStage stage=accepted equivale a buildAcceptedLink', () => {
  const a = buildAcceptedLink(SALE_PICKUP, OPTS);
  const b = buildLinkForStage('accepted', SALE_PICKUP, OPTS);
  eq(a!.url, b!.url);
});

it('buildLinkForStage stage=ready PICKUP equivale a buildReadyLink', () => {
  const a = buildReadyLink(SALE_PICKUP, OPTS);
  const b = buildLinkForStage('ready', SALE_PICKUP, OPTS);
  eq(a!.messagePlain, b!.messagePlain);
});

}); // describe('whatsapp build-link')

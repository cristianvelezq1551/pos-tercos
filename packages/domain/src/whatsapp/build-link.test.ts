/**
 * Tests de los builders wa.me. Ejecutar con:
 *   pnpm dlx tsx packages/domain/src/whatsapp/build-link.test.ts
 */

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

const tests: { name: string; run: () => void }[] = [];
const it = (name: string, run: () => void) => tests.push({ name, run });
const eq = (actual: unknown, expected: unknown, msg?: string) => {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'assertion'}: expected ${expected}, got ${actual}`);
  }
};
const truthy = (v: unknown, msg: string) => {
  if (!v) throw new Error(`expected truthy: ${msg}`);
};
const contains = (haystack: string, needle: string) => {
  if (!haystack.includes(needle)) {
    throw new Error(`expected to contain "${needle}" in:\n${haystack}`);
  }
};

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

// Run all
let pass = 0;
let fail = 0;
for (const t of tests) {
  try {
    t.run();
    pass++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    fail++;
    // eslint-disable-next-line no-console
    console.error(`  ✗ ${t.name}: ${(e as Error).message}`);
  }
}
// eslint-disable-next-line no-console
console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);

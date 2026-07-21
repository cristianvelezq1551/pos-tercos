/**
 * §1.C declara cerrado el invariante: "ShiftsService.close() es tx SERIALIZABLE
 * + advisory lock + guard WHERE OPEN + retry — un cobro concurrente al cierre ya
 * no descuadra el arqueo". Este e2e lo EJERCE: dispara en paralelo un cobro CASH
 * y el cierre de la MISMA caja y verifica el invariante financiero sobre el
 * estado final —
 *
 *   la venta quedó COBRADA en esta caja  ⟺  el esperado del arqueo la incluye.
 *
 * Nunca puede quedar plata cobrada (venta PAGADO) fuera del `expectedCash` de la
 * caja cerrada (arqueo ciego a una venta = descuadre real, el evento más sensible
 * del POS). El servidor escucha en `listen(0)` para permitir requests genuinamente
 * concurrentes (el server ephemeral por-request de supertest colisiona).
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PRICE = 4000;
const PAID_STATUSES = ['PAGADO', 'LISTO_DESPACHO', 'ENTREGADO'];

describe('Race cierre de caja vs cobro concurrente E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let prodId: string;
  let shiftId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await app.listen(0);
    request = supertest(app.getHttpServer());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-close@test.local', fullName: 'Dueño Close', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-close@test.local');

    const prod = await request
      .post('/products')
      .set(auth())
      .send({ name: 'Gaseosa Close', basePrice: PRICE, directResale: true, unitPurchase: 'unidad', unitStock: 'unidad', conversionFactor: 1, modifiersEnabled: false })
      .expect(201);
    prodId = prod.body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId: prodId, delta: 100, type: 'INITIAL', unitCost: 1000 })
      .expect(201);

    const shift = await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
    shiftId = shift.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('cobrar CASH mientras se cierra la caja deja un estado consistente (o entra al arqueo, o se rechaza)', async () => {
    // Venta COUNTER PENDIENTE_PAGO — el stock/efectivo se materializa al cobrar.
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: prodId, quantity: 1 }] })
      .expect(201);
    const saleId = sale.body.id as string;

    // El cobro y el cierre salen JUNTOS. `allSettled`: cualquiera puede ser
    // rechazado por la carrera y eso es correcto — lo que importa es el estado final.
    await Promise.allSettled([
      request.post(`/sales/${saleId}/confirm-payment`).set(auth()).send({ method: 'CASH', amountReceived: PRICE }),
      request.post(`/shifts/${shiftId}/close`).set(auth()).send({ countedCash: PRICE }),
    ]);

    // Fuente de verdad = la DB, no los códigos HTTP de la carrera.
    const finalSale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    const finalShift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });

    const saleCollectedInShift =
      PAID_STATUSES.includes(finalSale.status) && finalSale.shiftId === shiftId;

    if (finalShift.status === 'CLOSED') {
      const expected = Number(finalShift.expectedCash ?? 0);
      if (saleCollectedInShift) {
        // La plata entró a ESTA caja → el esperado DEBE reflejarla.
        expect(expected).toBe(PRICE);
      } else {
        // El cierre ganó primero → el cobro se rechazó, la venta sigue sin cobrar.
        expect(finalSale.status).toBe('PENDIENTE_PAGO');
        expect(expected).toBe(0);
      }
    } else {
      // Caso defensivo (no esperado): si la caja NO cerró, el cobro tuvo que ganar
      // y la venta quedó cobrada en la caja abierta (nunca plata cobrada + caja que
      // ignora la venta).
      expect(saleCollectedInShift).toBe(true);
    }
  });
});

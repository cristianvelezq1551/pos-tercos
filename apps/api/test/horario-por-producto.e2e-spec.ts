/**
 * E2E de las VENTANAS DE DISPONIBILIDAD por producto ("solo los miércoles").
 *
 * Lo que más importa acá no es que el horario funcione, sino que **no cambie
 * nada de lo que ya funciona**: un producto sin ventanas se tiene que vender
 * exactamente como antes. Ese es el primer caso y el que hay que mirar si
 * alguna vez esta suite se pone en rojo.
 *
 * Los casos no dependen de qué día corran: la ventana se construye a partir
 * del día de HOY (permitido) o del día siguiente (no permitido).
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** lunes=1 … domingo=64, igual que el motor de promociones. */
function bitDeHoy(offsetDias = 0): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const dow = d.getDay(); // 0=domingo
  return dow === 0 ? 64 : 1 << (dow - 1);
}

describe('Horario por producto (ventanas de disponibilidad)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cajeroToken: string;
  let bebidaId: string;
  let siempreId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    request = supertest(app.getHttpServer());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-horario@test.local',
          fullName: 'Dueño Horario',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-horario@test.local',
          fullName: 'Cajero Horario',
          role: 'ADMIN_OPERATIVO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-horario@test.local', 'dev12345');
    cajeroToken = await loginAs(request, 'cajero-horario@test.local', 'dev12345');
    await prisma.productCategory.createMany({
      data: [{ name: 'Bebidas', sortOrder: 0 }],
      skipDuplicates: true,
    });

    const crear = async (name: string) => {
      const res = await request
        .post('/products')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          name,
          category: 'Bebidas',
          basePrice: 5000,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
        });
      expect(res.status).toBe(201);
      await request
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ entityType: 'PRODUCT', productId: res.body.id, type: 'INITIAL', delta: 500, note: 'stock' });
      return res.body.id as string;
    };
    bebidaId = await crear('Bebida con horario');
    siempreId = await crear('Bebida de siempre');

    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 100000 });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const ponerVentanas = (id: string, windows: unknown[]) =>
    request
      .put(`/products/${id}/availability-windows`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ windows });

  const vender = (id: string) =>
    request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: id, quantity: 1, modifiers: [] }] });

  type Dispo = {
    productId: string;
    available: boolean;
    reason: string | null;
    stock: number | null;
  };

  /** La que ve el CAJERO: trae stock y motivo completos. */
  const disponibilidad = async (id: string) => {
    const res = await request
      .get('/products/availability/internal')
      .set('Authorization', `Bearer ${cajeroToken}`);
    expect(res.status).toBe(200);
    return (res.body as Dispo[]).find((p) => p.productId === id);
  };

  /** La que ve un CLIENTE anónimo en la web: sin stock ni motivos del negocio. */
  const disponibilidadPublica = async (id: string) => {
    const res = await request.get('/products/availability');
    expect(res.status).toBe(200);
    return (res.body as Dispo[]).find((p) => p.productId === id);
  };

  it('NO REGRESIÓN: un producto sin ventanas se vende igual que siempre', async () => {
    const d = await disponibilidad(siempreId);
    expect(d).toMatchObject({ available: true, reason: null });
    expect((await vender(siempreId)).status).toBe(201);
  });

  it('con una ventana de HOY se puede vender y aparece disponible', async () => {
    expect((await ponerVentanas(bebidaId, [{ daysOfWeekMask: bitDeHoy() }])).status).toBe(200);
    expect(await disponibilidad(bebidaId)).toMatchObject({ available: true, reason: null });
    expect((await vender(bebidaId)).status).toBe(201);
  });

  it('con una ventana de MAÑANA no se puede vender, y el motivo NO dice "agotado"', async () => {
    expect((await ponerVentanas(bebidaId, [{ daysOfWeekMask: bitDeHoy(1) }])).status).toBe(200);

    const d = await disponibilidad(bebidaId);
    expect(d?.available).toBe(false);
    expect(d?.reason?.toLowerCase()).toContain('solo');
    expect(d?.reason?.toLowerCase()).not.toContain('agotado');

    const venta = await vender(bebidaId);
    expect(venta.status).toBe(400);
    expect(venta.body.message).toContain('hoy no se vende');
  });

  it('el cliente de la web ve el motivo del horario — NO un "Agotado" que mentiría', async () => {
    await ponerVentanas(bebidaId, [{ daysOfWeekMask: bitDeHoy(1) }]);
    const pub = await disponibilidadPublica(bebidaId);
    expect(pub?.available).toBe(false);
    expect(pub?.reason?.toLowerCase()).toContain('solo');
  });

  it('el motivo de STOCK sigue sin viajar a la web: es información del negocio', async () => {
    // Sobre el producto que NUNCA tuvo horario, para que el caché de 15 s del
    // endpoint público (deliberado) no traiga un motivo de otro estado.
    const mover = (delta: number, note: string) =>
      request
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ entityType: 'PRODUCT', productId: siempreId, type: 'MANUAL_ADJUSTMENT', delta, note });

    const antes = (await disponibilidad(siempreId))?.stock ?? 0;
    // Se comprueba el montaje: un ajuste rechazado dejaría el caso pasando por
    // la razón equivocada.
    expect((await mover(-antes, 'dejar en cero para la prueba')).status).toBe(201);

    expect((await disponibilidad(siempreId))?.reason).toBe('Sin stock');
    // El cliente solo se entera de que no se puede, nunca de por qué.
    expect((await disponibilidadPublica(siempreId))?.reason ?? null).toBeNull();

    expect((await mover(antes, 'reponer')).status).toBe(201);
  });

  it('vaciar las ventanas lo devuelve a venderse siempre', async () => {
    expect((await ponerVentanas(bebidaId, [])).status).toBe(200);
    expect(await disponibilidad(bebidaId)).toMatchObject({ available: true });
    expect((await vender(bebidaId)).status).toBe(201);
  });

  it('varias ventanas: basta que una calce', async () => {
    await ponerVentanas(bebidaId, [
      { daysOfWeekMask: bitDeHoy(1) },
      { daysOfWeekMask: bitDeHoy() },
    ]);
    expect((await vender(bebidaId)).status).toBe(201);
  });

  it('"forzar disponible" NO se salta el horario: es para inventario, no para el calendario', async () => {
    await ponerVentanas(bebidaId, [{ daysOfWeekMask: bitDeHoy(1) }]);
    await request
      .post(`/products/${bebidaId}/force-available`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ forceAvailable: true, reason: 'prueba de horario' });

    expect((await disponibilidad(bebidaId))?.available).toBe(false);
    expect((await vender(bebidaId)).status).toBe(400);

    await request
      .post(`/products/${bebidaId}/force-available`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ forceAvailable: false, reason: 'fin de la prueba' });
    await ponerVentanas(bebidaId, []);
  });

  it('una cuenta abierta de un día permitido se puede COBRAR aunque el horario ya no aplique', async () => {
    await ponerVentanas(bebidaId, [{ daysOfWeekMask: bitDeHoy() }]);
    const venta = await vender(bebidaId);
    expect(venta.status).toBe(201);

    // Al día siguiente ya no se podría agregar… pero lo vendido se cobra igual.
    await ponerVentanas(bebidaId, [{ daysOfWeekMask: bitDeHoy(1) }]);
    const cobro = await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: venta.body.total });
    expect(cobro.status).toBe(201);
    expect(cobro.body.status).toBe('PAGADO');
    await ponerVentanas(bebidaId, []);
  });

  it('la base rechaza una ventana imposible (máscara fuera de rango)', async () => {
    expect((await ponerVentanas(bebidaId, [{ daysOfWeekMask: 0 }])).status).toBe(400);
    expect((await ponerVentanas(bebidaId, [{ daysOfWeekMask: 200 }])).status).toBe(400);
    expect(
      (await ponerVentanas(bebidaId, [{ daysOfWeekMask: 4, timeStart: '10:00:00' }])).status,
    ).toBe(400);
  });

  it('solo el dueño cambia el horario', async () => {
    const res = await request
      .put(`/products/${bebidaId}/availability-windows`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ windows: [] });
    expect(res.status).toBe(403);
  });
});

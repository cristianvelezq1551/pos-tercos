/**
 * Regresión: el aviso de descuadre de EFECTIVO colgaba de `if (alertLink)`, y
 * ese link es null sin `OWNER_WHATSAPP_PHONE`. En producción —donde esa
 * variable NO está— un descuadre de efectivo no avisaba por ningún canal, ni
 * siquiera por notificación del navegador. Los caminos digital y combinado
 * (§7.v20) nunca tuvieron ese enganche; este, que es el más viejo, sí.
 *
 * Suite aparte porque la caja es ÚNICA por día de negocio: no se puede abrir
 * una segunda en la misma corrida que la suite del descuadre combinado.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { esperarHasta } from './helpers/esperar-hasta';

describe('Descuadre de efectivo sin WhatsApp E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let shiftId: string;
  let productId: string;

  const PRICE = 10_000;
  const OPENING = 50_000;
  const FALTANTE = 9_000; // por encima del umbral de $5.000
  const telefonoOriginal = process.env.OWNER_WHATSAPP_PHONE;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // El `delete` va DESPUÉS de levantar la app: el `.env` se carga como
    // efecto colateral de importar `@prisma/client` (§7.v35), así que borrarlo
    // antes no sirve de nada — la variable reaparece.
    delete process.env.OWNER_WHATSAPP_PHONE;
    await cleanDb(prisma);
    await prisma.user.create({
      data: {
        email: 'dueno-sinwa@test.local',
        fullName: 'Dueño SinWA',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-sinwa@test.local');

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gaseosa SinWA',
        category: 'Bebidas',
        basePrice: PRICE,
        directResale: true,
        unitPurchase: 'unidad',
        unitStock: 'unidad',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    productId = prod.body.id;

    // Sin existencias el cobro da 409 por stock insuficiente y el test
    // fallaría por un motivo que no tiene que ver con el aviso.
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ entityType: 'PRODUCT', productId, delta: 20, type: 'INITIAL', notes: 'stock test' })
      .expect(201);

    const abierto = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ openingCash: OPENING })
      .expect(201);
    shiftId = abierto.body.id;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
    if (telefonoOriginal !== undefined) process.env.OWNER_WHATSAPP_PHONE = telefonoOriginal;
  });

  it('avisa del descuadre aunque no haya teléfono configurado', async () => {
    const venta = await request
      .post('/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amountReceived: PRICE })
      .expect(201);

    // Se vuelve a quitar acá: es el instante que importa y no depende del
    // orden en que jest ejecutó los ganchos.
    delete process.env.OWNER_WHATSAPP_PHONE;
    const cerrado = await request
      .post(`/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: OPENING + PRICE - FALTANTE })
      .expect(201);
    expect(cerrado.body.difference).toBe(-FALTANTE);

    const novedades = await prisma.auditLog.findMany({
      where: { action: 'SHIFT_DISCREPANCY_DETECTED', entityId: shiftId },
    });
    expect(novedades).toHaveLength(1);

    const metadata = novedades[0].metadata as {
      whatsappAlertUrl: string | null;
      whatsappAlertMessage: string | null;
      difference: number;
    };
    // Sin teléfono no hay link wa.me — y el TEXTO del aviso existe igual.
    expect(metadata.whatsappAlertUrl).toBeNull();
    expect(metadata.whatsappAlertMessage).toContain('Descuadre en el cierre de caja');
    expect(metadata.whatsappAlertMessage).toContain('faltante');
    expect(metadata.difference).toBe(-FALTANTE);

    // Y se intentó avisar de verdad: queda el registro con su canal y su
    // resultado. Antes de este arreglo no había NINGUNA fila.
    //
    // Se ESPERA a que aparezca: el aviso sale fire-and-forget (`void
    // this.ownerNotifications.alert(...)`) para que un fallo del canal nunca
    // revierta el cierre, así que la fila se escribe DESPUÉS de que la
    // petición respondió. Leerla de inmediato ganaba la carrera en local y la
    // perdía en CI — el fallo real de la corrida 33424680824.
    const enviado = await esperarHasta(() =>
      prisma.auditLog.findFirst({
        where: { action: 'OWNER_ALERT_SENT' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(enviado).not.toBeNull();
    expect((enviado!.metadata as { kind?: string }).kind).toBe('shift_discrepancy');
  });
});

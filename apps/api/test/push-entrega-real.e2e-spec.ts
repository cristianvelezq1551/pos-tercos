/**
 * El camino COMPLETO de producción, con llaves VAPID reales: desde que el
 * escaneo detecta un insumo bajo mínimo hasta que el aviso llega descifrado.
 *
 * Lo único falso acá es el servicio de push (un servidor local en vez de Google
 * o Mozilla) — todo lo demás es el cableado de producción: el factory del
 * módulo elige el adapter real, `OwnerNotificationService` decide el canal, y
 * el cuerpo se descifra con la llave privada del "navegador" para comprobar
 * que llega EXACTAMENTE el aviso que corresponde.
 *
 * Sin esta suite, lo verificado quedaba en piezas sueltas: el cifrado contra el
 * vector del RFC y los endpoints por separado. Acá se prueban unidas.
 */
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { padEscalar } from '../src/adapters/push/web-push-crypto';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** Par de llaves VAPID de verdad, generado para esta corrida. */
function llavesVapid() {
  const e = createECDH('prime256v1');
  e.generateKeys();
  return {
    publicKey: e.getPublicKey().toString('base64url'),
    // Rellenado a 32 bytes: `getPrivateKey()` devuelve la representación
    // mínima y ~4 de cada 1.000 salen con 31 (fue un fallo intermitente real).
    privateKey: padEscalar(e.getPrivateKey()).toString('base64url'),
  };
}

describe('Entrega real de avisos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let server: Server;
  let base: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** El "navegador": con su privada se descifra lo que llegue. */
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const authSecret = randomBytes(16);

  let recibidos: Buffer[] = [];
  let respuesta = 201;
  const envAnterior = { ...process.env };

  beforeAll(async () => {
    // Servicio de push falso: guarda lo que le llega.
    server = createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on('data', (c: Buffer) => trozos.push(c));
      req.on('end', () => {
        recibidos.push(Buffer.concat(trozos));
        res.writeHead(respuesta);
        res.end();
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Las llaves van ANTES de levantar la app: el factory del módulo las lee
    // al construirse, igual que en producción.
    const vapid = llavesVapid();
    process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:duenio@tercos.co';
    process.env.BUSINESS_NAME = 'Tercos';
    // Sin teléfono del dueño para que no haya duda de qué canal entregó.
    delete process.env.OWNER_WHATSAPP_PHONE;

    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-entrega@test.local',
        fullName: 'Dueño EN',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-entrega@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
    await new Promise<void>((ok) => server.close(() => ok()));
    process.env = envAnterior;
  });

  beforeEach(async () => {
    recibidos = [];
    respuesta = 201;
    // Cada caso arranca sin dispositivos: si se acumulan, un aviso llega a los
    // de los casos anteriores y los conteos dejan de significar algo.
    await prisma.pushSubscription.deleteMany();
  });

  /**
   * Suscribe un dispositivo que apunta al servicio falso.
   *
   * Va DIRECTO a la base y no por `POST /push/subscribe` porque ese endpoint
   * exige `https` —correctamente: por ahí viaja el aviso cifrado— y el servicio
   * falso es local sin TLS. Relajar esa validación para que pase un test sería
   * debilitar producción; el alta por endpoint ya está cubierta en
   * `push-avisos.e2e-spec.ts`. Acá lo que se prueba es la ENTREGA.
   */
  const suscribir = async (sufijo = 'uno') => {
    const endpoint = `${base}/push/${sufijo}`;
    const dueno = await prisma.user.findUniqueOrThrow({
      where: { email: 'dueno-entrega@test.local' },
    });
    await prisma.pushSubscription.create({
      data: {
        userId: dueno.id,
        endpoint,
        p256dh: ua.getPublicKey().toString('base64url'),
        auth: authSecret.toString('base64url'),
        userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Safari/604.1',
      },
    });
    return endpoint;
  };

  /** Lo que haría el service worker: descifrar y leer el JSON. */
  function leerAviso(indice = 0): { title: string; body: string; url?: string; tag?: string } {
    const body = recibidos[indice];
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const ct = body.subarray(21 + idlen);
    const shared = ua.computeSecret(asPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
    const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
    const cek = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
    );
    const nonce = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
    );
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plano = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    return JSON.parse(plano.subarray(0, plano.length - 1).toString('utf8'));
  }

  /** Espera a que el servicio falso reciba, porque el aviso es fire-and-forget. */
  async function esperarAvisos(cuantos = 1, ms = 3000): Promise<void> {
    const limite = Date.now() + ms;
    while (recibidos.length < cuantos && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('con las llaves puestas, el servidor entrega su llave pública', async () => {
    const res = await request.get('/push/status').set(auth()).expect(200);
    expect(res.body.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);
  });

  it('el aviso de prueba llega descifrable y con el texto correcto', async () => {
    await suscribir('prueba');
    const res = await request.post('/push/test').set(auth()).expect(200);
    expect(res.body).toMatchObject({ sent: 1, failed: 0, reason: null });

    await esperarAvisos();
    expect(leerAviso()).toMatchObject({
      title: 'Prueba de avisos',
      url: '/avisos',
    });
  });

  it('un insumo bajo mínimo dispara el aviso REAL, con nombre y cantidades', async () => {
    await suscribir('stock');
    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({
        name: 'Pan brioche',
        unitPurchase: 'paquete',
        unitRecipe: 'unidad',
        conversionFactor: 12,
        thresholdMin: 30,
      })
      .expect(201);
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({
        entityType: 'INGREDIENT',
        ingredientId: ing.body.id,
        delta: 21,
        type: 'INITIAL',
        unitCost: 100,
      })
      .expect(201);

    await request.post('/purchase-suggestions/admin/scan').set(auth()).expect(201);
    await esperarAvisos();

    const aviso = leerAviso();
    expect(aviso.title).toBe('Tercos · Stock bajo');
    expect(aviso.body).toContain('Pan brioche: 21 de 30 unidad');
    // Aterriza donde se resuelve, no en el inicio. Desde que Sugerencias se
    // fusionó con Listas de faltantes, ese lugar es la lista.
    expect(aviso.url).toBe('/purchase-lists');
    expect(aviso.tag).toBe('low_stock');
    // Sin asteriscos: son negrita de WhatsApp y acá serían ruido.
    expect(aviso.body).not.toContain('*');
  });

  it('el segundo escaneo NO vuelve a avisar del mismo insumo', async () => {
    // El escaneo corre cada hora y el insumo sigue bajo mínimo: repetirlo
    // convertiría el aviso en ruido horario y dejaría de leerse.
    await suscribir('repetido');
    await request.post('/purchase-suggestions/admin/scan').set(auth()).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(recibidos).toHaveLength(0);
  });

  it('la bitácora registra que SÍ se entregó, y por qué canal', async () => {
    await suscribir('bitacora');
    await request.post('/push/test').set(auth()).expect(200);
    await esperarAvisos();

    // El aviso de prueba no pasa por la bitácora; el de negocio sí.
    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({
        name: 'Queso Paipa',
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 500,
      })
      .expect(201);
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: ing.body.id, delta: 100, type: 'INITIAL', unitCost: 100 })
      .expect(201);
    await request.post('/purchase-suggestions/admin/scan').set(auth()).expect(201);
    await esperarAvisos(2);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'OWNER_ALERT_SENT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.metadata).toMatchObject({
      kind: 'low_stock',
      channel: 'web-push',
      ok: true,
      delivered: true,
      devices: 1,
    });
  });

  it('marca el dispositivo con la fecha del último aviso', async () => {
    const endpoint = await suscribir('marca');
    await request.post('/push/test').set(auth()).expect(200);
    await esperarAvisos();
    const fila = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    expect(fila?.lastSentAt).not.toBeNull();
  });

  it('un dispositivo muerto (410) se borra solo', async () => {
    // Sin esto, cada aviso reintenta para siempre navegadores desinstalados.
    await suscribir('muerto');
    respuesta = 410;
    const res = await request.post('/push/test').set(auth()).expect(200);
    expect(res.body).toMatchObject({ sent: 0, failed: 1, removed: 1 });
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('un 500 del servicio NO borra el dispositivo', async () => {
    await suscribir('caido');
    respuesta = 500;
    const res = await request.post('/push/test').set(auth()).expect(200);
    expect(res.body).toMatchObject({ sent: 0, failed: 1, removed: 0 });
    expect(await prisma.pushSubscription.count()).toBe(1);
  });

  it('dos dispositivos reciben el mismo aviso', async () => {
    await suscribir('celular');
    await suscribir('computador');
    const res = await request.post('/push/test').set(auth()).expect(200);
    expect(res.body.sent).toBe(2);
    await esperarAvisos(2);
    expect(leerAviso(0).title).toBe('Prueba de avisos');
    expect(leerAviso(1).title).toBe('Prueba de avisos');
  });
});

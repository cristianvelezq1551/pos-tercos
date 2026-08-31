/**
 * Notificaciones del navegador. Lo que se prueba acá es el CONTRATO —quién
 * puede suscribirse, qué pasa con una llave falsa, y que sin llaves VAPID el
 * servidor lo DIGA en vez de fingir que avisó (§7.v22)—. El cifrado en sí se
 * verifica contra el vector oficial del RFC 8291 en su test unitario.
 *
 * Corre SIN llaves VAPID a propósito: es la configuración con la que arranca
 * un servidor recién desplegado, y es donde más fácil se cuela un "enviado"
 * que no existió.
 */
import { createECDH, randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** Una suscripción con la forma exacta que entrega un navegador real. */
function suscripcionValida(sufijo: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${sufijo}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
  };
}

describe('Notificaciones del navegador E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let tokenDueno: string;
  let tokenOperativo: string;
  let tokenCajero: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-push@test.local', fullName: 'Dueño PU', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'op-push@test.local', fullName: 'Op PU', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-push@test.local', fullName: 'Cajero PU', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    tokenDueno = await loginAs(request, 'dueno-push@test.local');
    tokenOperativo = await loginAs(request, 'op-push@test.local');
    tokenCajero = await loginAs(request, 'cajero-push@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  afterEach(async () => {
    await prisma.pushSubscription.deleteMany();
  });

  const alta = (token: string, sub: ReturnType<typeof suscripcionValida>) =>
    request.post('/push/subscribe').set('Authorization', `Bearer ${token}`).send(sub);

  it('sin llaves VAPID el servidor lo dice: no ofrece un botón que no hace nada', async () => {
    const res = await request
      .get('/push/status')
      .set('Authorization', `Bearer ${tokenDueno}`)
      .expect(200);
    expect(res.body.publicKey).toBeNull();
    expect(res.body.devices).toEqual([]);
  });

  it('guarda el dispositivo y lo devuelve reconocible', async () => {
    const sub = suscripcionValida('dispositivo-1');
    await alta(tokenDueno, sub).expect(204);

    const res = await request
      .get(`/push/status?endpoint=${encodeURIComponent(sub.endpoint)}`)
      .set('Authorization', `Bearer ${tokenDueno}`)
      .expect(200);

    expect(res.body.devices).toHaveLength(1);
    expect(res.body.devices[0]).toMatchObject({
      label: 'Chrome en Android',
      isCurrent: true,
      lastSentAt: null,
    });
  });

  it('re-suscribir el MISMO dispositivo actualiza, no acumula', async () => {
    const sub = suscripcionValida('dispositivo-2');
    await alta(tokenDueno, sub).expect(204);
    // El navegador rota sus llaves por su cuenta: guardar las viejas dejaría
    // avisos que el dispositivo ya no puede descifrar.
    const rotada = { ...suscripcionValida('dispositivo-2'), endpoint: sub.endpoint };
    await alta(tokenDueno, rotada).expect(204);

    const filas = await prisma.pushSubscription.findMany({ where: { endpoint: sub.endpoint } });
    expect(filas).toHaveLength(1);
    expect(filas[0].p256dh).toBe(rotada.keys.p256dh);
  });

  it('un equipo compartido pasa a ser de quien se suscribió último', async () => {
    const sub = suscripcionValida('compartido');
    await alta(tokenDueno, sub).expect(204);
    await alta(tokenOperativo, sub).expect(204);

    // Si el dueño lo siguiera teniendo, recibiría los avisos en un equipo que
    // ya no está usando.
    const delDueno = await request
      .get('/push/status')
      .set('Authorization', `Bearer ${tokenDueno}`)
      .expect(200);
    expect(delDueno.body.devices).toHaveLength(0);

    const delOperativo = await request
      .get('/push/status')
      .set('Authorization', `Bearer ${tokenOperativo}`)
      .expect(200);
    expect(delOperativo.body.devices).toHaveLength(1);
  });

  it('rechaza una llave que no está sobre la curva P-256', async () => {
    // Lo exige el RFC 8291 §7. Además: una llave mal formada aceptada acá solo
    // se descubriría al primer aviso, o sea cuando más importa que salga.
    const falsa = {
      ...suscripcionValida('curva-mala'),
      keys: {
        p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    };
    const res = await alta(tokenDueno, falsa).expect(400);
    expect(String(res.body.message)).toMatch(/curva P-256/);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('rechaza un secreto de autenticación del largo equivocado', async () => {
    const sub = suscripcionValida('auth-corto');
    await alta(tokenDueno, { ...sub, keys: { ...sub.keys, auth: randomBytes(8).toString('base64url') } })
      .expect(400);
  });

  it('rechaza un endpoint que no es https', async () => {
    // Por ahí viaja el aviso cifrado y es a quien se le firma el JWT de VAPID.
    const sub = suscripcionValida('inseguro');
    await alta(tokenDueno, { ...sub, endpoint: 'http://fcm.googleapis.com/fcm/send/x' }).expect(400);
  });

  it('la baja borra el dispositivo', async () => {
    const sub = suscripcionValida('dispositivo-3');
    await alta(tokenDueno, sub).expect(204);
    await request
      .post('/push/unsubscribe')
      .set('Authorization', `Bearer ${tokenDueno}`)
      .send({ endpoint: sub.endpoint })
      .expect(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('nadie da de baja el dispositivo de otro', async () => {
    const sub = suscripcionValida('ajeno');
    await alta(tokenDueno, sub).expect(204);
    await request
      .post('/push/unsubscribe')
      .set('Authorization', `Bearer ${tokenOperativo}`)
      .send({ endpoint: sub.endpoint })
      .expect(204);
    expect(await prisma.pushSubscription.count()).toBe(1);
  });

  it('la prueba NO finge: sin llaves declara que no salió y por qué', async () => {
    await alta(tokenDueno, suscripcionValida('prueba')).expect(204);
    const res = await request
      .post('/push/test')
      .set('Authorization', `Bearer ${tokenDueno}`)
      .expect(200);
    expect(res.body).toMatchObject({ sent: 0, failed: 0, removed: 0 });
    expect(String(res.body.reason)).toMatch(/llaves VAPID/);
  });

  it('el aviso de prueba no marca el dispositivo como usado si no se envió', async () => {
    await alta(tokenDueno, suscripcionValida('sin-uso')).expect(204);
    await request.post('/push/test').set('Authorization', `Bearer ${tokenDueno}`).expect(200);
    const fila = await prisma.pushSubscription.findFirst();
    expect(fila?.lastSentAt).toBeNull();
  });

  it('el cajero no entra: los avisos de negocio son del dueño y el administrador', async () => {
    await request
      .get('/push/status')
      .set('Authorization', `Bearer ${tokenCajero}`)
      .expect(403);
    await alta(tokenCajero, suscripcionValida('cajero')).expect(403);
  });

  it('sin sesión no se puede suscribir nada', async () => {
    await request.get('/push/status').expect(401);
    await request.post('/push/subscribe').send(suscripcionValida('anonimo')).expect(401);
  });
});

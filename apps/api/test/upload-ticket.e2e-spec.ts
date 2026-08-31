import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/**
 * El permiso de subida existe porque el navegador NO puede mandar un archivo
 * grande por el proxy de la app —corta el cuerpo cerca de 4,5 MB— y la cookie
 * httpOnly no viaja a otro origen. Vive segundos en el JS de la página.
 *
 * Por eso lo que hay que fijar no es que funcione, sino que NO sirva para nada
 * más: si alguien lo roba, lo único que consigue es subir un archivo.
 *
 * (La primera versión reusaba el token del WebSocket. El guard lo rechaza a
 * propósito, así que la subida moría con un 401 que el navegador mostraba como
 * ERR_HTTP2_PROTOCOL_ERROR — el servidor corta el cuerpo a medio camino.
 * Encontrado subiendo una canción de 6 MB en producción.)
 */
describe('Permiso de subida E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let permiso: string;
  let sesion: string;

  const mp3 = (n: number): Buffer => Buffer.from('ID3'.repeat(n));

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-upload@test.local',
        fullName: 'Dueno Upload',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    sesion = await loginAs(request, 'dueno-upload@test.local');
    const res = await request
      .get('/auth/upload-ticket')
      .set('Authorization', `Bearer ${sesion}`)
      .expect(200);
    permiso = res.body.token as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('deja subir en la ruta marcada', async () => {
    await request
      .post('/display/tracks')
      .set('Authorization', `Bearer ${permiso}`)
      .field('label', 'pista de prueba')
      .attach('audio', mp3(64), { filename: 'p.mp3', contentType: 'audio/mpeg' })
      .expect(201);
  });

  /** El cerco: un permiso robado NO puede leer plata ni tocar nada mas. */
  it('NO abre ninguna otra puerta', async () => {
    for (const ruta of ['/sales', '/reports/dashboard', '/treasury/summary', '/users']) {
      await request.get(ruta).set('Authorization', `Bearer ${permiso}`).expect(401);
    }
  });

  it('tampoco sirve para escribir en otro lado', async () => {
    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${permiso}`)
      .send({ openingCash: 100000 })
      .expect(401);
  });

  it('el token del WebSocket NO sirve para subir (son alcances distintos)', async () => {
    const ws = (
      await request.get('/auth/ws-token').set('Authorization', `Bearer ${sesion}`).expect(200)
    ).body.token as string;
    await request
      .post('/display/tracks')
      .set('Authorization', `Bearer ${ws}`)
      .field('label', 'con token de ws')
      .attach('audio', mp3(8), { filename: 'p.mp3', contentType: 'audio/mpeg' })
      .expect(401);
  });

  it('la sesion normal sigue subiendo igual (no se rompio el camino de siempre)', async () => {
    await request
      .post('/display/tracks')
      .set('Authorization', `Bearer ${sesion}`)
      .field('label', 'con la sesion')
      .attach('audio', mp3(32), { filename: 'p.mp3', contentType: 'audio/mpeg' })
      .expect(201);
  });

  it('sin permiso ni sesion, nada', async () => {
    await request.get('/auth/upload-ticket').expect(401);
  });
});

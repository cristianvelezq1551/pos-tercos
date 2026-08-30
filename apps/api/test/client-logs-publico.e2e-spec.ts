/**
 * El endpoint por el que la web del cliente, la cocina y el TV reportan los
 * errores que revientan en el navegador. Es PÚBLICO por necesidad (el cliente
 * de la web es anónimo), así que lo que se prueba es que la forma acote el
 * abuso: campos fijos, largos cortos y nada que persista.
 */
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Errores del navegador (endpoint público) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  const valido = { app: 'web', scope: 'window.error', message: 'boom', path: '/checkout' };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('acepta un reporte sin sesión y no devuelve cuerpo', async () => {
    const res = await request.post('/client-logs/public').send(valido).expect(204);
    expect(res.text).toBe('');
  });

  it('acepta sin `path` (no siempre se sabe dónde pasó)', async () => {
    await request
      .post('/client-logs/public')
      .send({ app: 'display', scope: 'unhandledrejection', message: 'x' })
      .expect(204);
  });

  it('rechaza una app inventada: solo las tres pantallas conocidas', async () => {
    await request.post('/client-logs/public').send({ ...valido, app: 'admin' }).expect(400);
  });

  /** Sin tope, el log del servidor es un vertedero gratis para cualquiera. */
  it('rechaza un mensaje larguísimo', async () => {
    await request
      .post('/client-logs/public')
      .send({ ...valido, message: 'x'.repeat(301) })
      .expect(400);
  });

  /**
   * Un campo de más se DESCARTA, no rompe: un bundle viejo en caché no debe
   * perder su reporte. Lo que importa es que nunca llegue al log — solo se
   * escriben los campos conocidos.
   */
  it('ignora campos de más en vez de rechazar el reporte', async () => {
    await request
      .post('/client-logs/public')
      .send({ ...valido, context: { cualquier: 'cosa' } })
      .expect(204);
  });

  it('rechaza un reporte vacío', async () => {
    await request.post('/client-logs/public').send({}).expect(400);
  });

  /**
   * El texto lo escribe quien reporta: con un `\n` se pueden FORJAR líneas de
   * log completas y ensuciar justo la evidencia que se mira cuando algo huele
   * mal (CWE-117). Se acepta, pero aplanado.
   */
  it('acepta saltos de línea sin romperse (se aplanan al loguear)', async () => {
    await request
      .post('/client-logs/public')
      .send({ ...valido, message: 'boom\n2026-01-01 ERROR [Auth] login exitoso' })
      .expect(204);
  });

  it('el endpoint con sesión sigue exigiéndola', async () => {
    await request.post('/client-logs').send({ scope: 's', message: 'm' }).expect(401);
  });
});

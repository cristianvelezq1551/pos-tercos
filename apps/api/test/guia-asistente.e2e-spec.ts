/**
 * Asistente de la guía. Sin llave de IA en el entorno de test, el camino feliz
 * no se puede probar acá — y eso es justamente lo que se verifica: que ante un
 * proveedor no disponible RESPONDA que no está disponible, en vez de inventar
 * una respuesta o devolver un 500 crudo.
 */
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Asistente de la guía E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocineroToken: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const passwordHash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'guia-dueno@test.local', fullName: 'Dueño', passwordHash, role: 'DUENO' },
    });
    await prisma.user.create({
      data: { email: 'guia-coc@test.local', fullName: 'Cocinero', passwordHash, role: 'COCINERO' },
    });
    duenoToken = await loginAs(request, 'guia-dueno@test.local');
    cocineroToken = await loginAs(request, 'guia-coc@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('sin sesión no responde', async () => {
    await request.post('/guia/preguntar').send({ question: '¿cómo registro una merma?' }).expect(401);
  });

  it('el cocinero también puede preguntar: es quien más lo necesita', async () => {
    const res = await request
      .post('/guia/preguntar')
      .set(auth(cocineroToken))
      .send({ question: '¿cómo registro una merma?' });
    // 503 si no hay llave configurada. Lo que NO puede pasar es 401/403.
    expect([200, 503]).toContain(res.status);
  });

  it('una pregunta vacía o muy corta es 400 con un mensaje que se entiende', async () => {
    const res = await request
      .post('/guia/preguntar')
      .set(auth(duenoToken))
      .send({ question: 'qué' })
      .expect(400);
    expect(String(res.body.message)).toMatch(/pregunta/i);
  });

  it('una pregunta larguísima es 400 y dice el límite', async () => {
    const res = await request
      .post('/guia/preguntar')
      .set(auth(duenoToken))
      .send({ question: 'a'.repeat(301) })
      .expect(400);
    expect(String(res.body.message)).toMatch(/larga|300/i);
  });

  it('sin pregunta en el cuerpo es 400, no 500', async () => {
    await request.post('/guia/preguntar').set(auth(duenoToken)).send({}).expect(400);
  });

  it('sin proveedor de IA responde que no está disponible y remite a la guía', async () => {
    const res = await request
      .post('/guia/preguntar')
      .set(auth(duenoToken))
      .send({ question: '¿cómo registro una merma de repollo?' });
    if (res.status === 503) {
      // Nunca un 500 crudo ni un texto inventado.
      expect(String(res.body.message)).toMatch(/guía/i);
    } else {
      expect(res.status).toBe(200);
      expect(typeof res.body.answer).toBe('string');
    }
  });
});

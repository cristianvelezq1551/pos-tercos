/**
 * Asistente de la guía.
 *
 * El proveedor de IA va MOCKEADO a propósito. Con el real, cada test tardaba
 * entre 2,4 y 3,4 s —peligrosamente cerca del timeout de 5 s de jest— y cuando
 * se pasaba, la suite abortaba sin correr su `cleanDb`: la base quedaba sucia y
 * arrastraba a las 30 suites siguientes con errores que no tenían nada que ver.
 * Además cobraba en cada corrida.
 *
 * Lo que se verifica acá es el CONTRATO del endpoint —validación, roles, y que
 * un proveedor caído responda honestamente— no la calidad de la respuesta del
 * modelo, que se mide con los tests de recuperación en `domain`.
 */
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import * as bcrypt from 'bcrypt';
import { palabrasVoseo } from '@pos-tercos/domain';
import type { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/adapters/llm/llm.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Asistente de la guía E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocineroToken: string;
  /** Se enciende para probar el camino del proveedor caído. */
  let llmCaido = false;
  /** Hace que el primer intento venga en voseo, para probar el reintento. */
  let llmVosea = false;
  let llamadas = 0;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp((b) =>
      b.overrideProvider(LLMService).useValue({
        complete: (req: { systemPrompt: string; userPrompt: string }) => {
          llamadas += 1;
          // El reintento se reconoce porque el system trae la corrección.
          const esReintento = req.systemPrompt.includes('voseo:');
          const texto =
            llmVosea && !esReintento
              ? 'Abre la semana que querés pagar y marcás los días.'
              : `Cocina → Inventario → botón Merma. Escribe la cantidad y guarda. ` +
                `[bloques=${(req.userPrompt.match(/## FLUJO:/g) ?? []).length}]`;
          return Promise.resolve({ text: llmCaido ? '' : texto, modelUsed: 'test:mock' });
        },
      }),
    ));
    await cleanDb(prisma);
    const passwordHash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'guia-dueno@test.local',
        fullName: 'Dueño',
        passwordHash,
        role: 'DUENO',
        mustChangePwd: false,
        active: true,
      },
    });
    await prisma.user.create({
      data: {
        email: 'guia-coc@test.local',
        fullName: 'Cocinero',
        passwordHash,
        role: 'COCINERO',
        mustChangePwd: false,
        active: true,
      },
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

  it('el prompt que recibe el modelo LLEVA los flujos de la guía', async () => {
    // Es la garantía de fondo del asistente: responde con base en la guía y no
    // con lo que el modelo recuerde del mundo.
    const res = await request
      .post('/guia/preguntar')
      .set(auth(duenoToken))
      .send({ question: '¿cómo registro una merma de repollo?' })
      .expect(200);
    const bloques = Number(/\[bloques=(\d+)\]/.exec(String(res.body.answer))?.[1] ?? 0);
    expect(bloques).toBeGreaterThan(0);
    expect(res.body.model).toBe('test:mock');
  });

  it('la respuesta no puede venir en voseo', async () => {
    // Regresión real con el modelo de verdad: preguntando "dónde cargo el
    // arriendo" respondió "escribís, marcás, elegís, guardás". Acá se verifica
    // el guardarraíl; el prompt que lo evita se cubre en los tests de domain.
    const res = await request
      .post('/guia/preguntar')
      .set(auth(duenoToken))
      .send({ question: '¿dónde cargo el arriendo del local?' })
      .expect(200);
    expect(palabrasVoseo(String(res.body.answer))).toEqual([]);
  });

  it('si el modelo responde en voseo, se reintenta y sale en tuteo', async () => {
    // Regresión real en QA: "abre la semana que QUERÉS pagar". El prompt lo
    // prohíbe pero el modelo se va igual de vez en cuando; con el detector en
    // la mano no hay razón para publicarlo.
    llmVosea = true;
    llamadas = 0;
    try {
      const res = await request
        .post('/guia/preguntar')
        .set(auth(duenoToken))
        .send({ question: '¿cómo le pago a los empleados?' })
        .expect(200);
      expect(palabrasVoseo(String(res.body.answer))).toEqual([]);
      expect(llamadas).toBe(2); // un reintento, no más
    } finally {
      llmVosea = false;
    }
  });

  it('con el proveedor caído responde 503 y remite a la guía, sin inventar', async () => {
    llmCaido = true;
    try {
      const res = await request
        .post('/guia/preguntar')
        .set(auth(duenoToken))
        .send({ question: '¿cómo registro una merma de repollo?' });
      // Un texto vacío del proveedor NO se devuelve como respuesta buena: se
      // responde 503 remitiendo a la guía escrita.
      expect(res.status).toBe(503);
      expect(String(res.body.message)).toMatch(/guía/i);
      expect(res.body.answer).toBeUndefined();
    } finally {
      llmCaido = false;
    }
  });
});

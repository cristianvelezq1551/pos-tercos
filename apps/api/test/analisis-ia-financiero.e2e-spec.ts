/**
 * El botón "Analizar el mes" de Finanzas → Estado.
 *
 * Un fallo del PROVEEDOR (cuenta sin saldo, llave revocada, servicio saturado)
 * no es un bug del sistema: salía como 500 —"el sistema tuvo un problema", que
 * no le dice al dueño qué hacer— y además abría un Issue de alerta de
 * producción por algo que ningún cambio de código arregla. Se descubrió
 * tocando el botón contra un entorno real cuya cuenta de IA se quedó sin saldo.
 *
 * Lo que se fija acá es el contrato: una respuesta buena se entrega, y un
 * fallo del proveedor es un 502 con un mensaje accionable, nunca un 500.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { LLMService } from '../src/adapters/llm/llm.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const ANALISIS_OK = JSON.stringify({
  tono: 'atencion',
  titular: 'Vas corto contra la meta del mes.',
  bullets: [{ tipo: 'vigilar', texto: 'Llevas el 15% de la meta con el 43% del mes corrido.' }],
  siguiente_paso: 'Revisa el margen de los platos que más se venden.',
});

describe('Análisis con IA del estado financiero', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let fallar: Error | null = null;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const now = new Date();
  const ruta = `/reports/financial/analyze?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp((b) =>
      b.overrideProvider(LLMService).useValue({
        complete: () => {
          if (fallar) return Promise.reject(fallar);
          return Promise.resolve({ text: ANALISIS_OK, modelUsed: 'modelo-de-prueba' });
        },
      }),
    ));
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-ia@test.local',
        fullName: 'Dueño IA',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-ia@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  beforeEach(() => {
    fallar = null;
  });

  it('con el proveedor sano devuelve el análisis', async () => {
    const r = await request.post(ruta).set(auth()).send({}).expect(201);
    const b = r.body as { tono: string; titular: string; modelUsed?: string };
    expect(b.tono).toBe('atencion');
    expect(b.titular).toContain('meta del mes');
  });

  it('la cuenta sin saldo es 502 con un mensaje que se entiende, no un 500', async () => {
    fallar = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
    );
    const r = await request.post(ruta).set(auth()).send({}).expect(502);
    const msg = String((r.body as { message: string }).message);
    expect(msg).toMatch(/sin saldo/i);
    // Nada de inglés, nombres de variables ni códigos en la pantalla (§3).
    expect(msg).not.toMatch(/credit balance|ANTHROPIC|invalid_request/i);
  });

  it('la llave revocada también es 502 y dice qué hacer', async () => {
    fallar = new Error('401 authentication_error: invalid x-api-key');
    const r = await request.post(ruta).set(auth()).send({}).expect(502);
    expect(String((r.body as { message: string }).message)).toMatch(/llave/i);
  });

  it('el servicio saturado invita a reintentar', async () => {
    fallar = new Error('529 overloaded_error');
    const r = await request.post(ruta).set(auth()).send({}).expect(502);
    expect(String((r.body as { message: string }).message)).toMatch(/vuelve a intentar/i);
  });
});

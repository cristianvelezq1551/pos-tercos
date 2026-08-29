/**
 * El canal de avisos técnicos (§7.v48). Dos cosas que importan: que solo el
 * dueño pueda dispararlo, y que SIN canal configurado responda "no salió"
 * en vez de fingir que avisó — el patrón que dejó al WhatsApp mudo durante
 * meses mientras la bitácora afirmaba envíos (§7.v22).
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Simulacro del canal de avisos técnicos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let tokenDueno: string;
  let tokenOperativo: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-alert@test.local', fullName: 'Dueño AL', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'op-alert@test.local', fullName: 'Op AL', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    tokenDueno = await loginAs(request, 'dueno-alert@test.local');
    tokenOperativo = await loginAs(request, 'op-alert@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('sin ALERT_GITHUB_* el simulacro dice que NO se avisó a nadie', async () => {
    const res = await request
      .post('/healthz/alert-drill')
      .set('Authorization', `Bearer ${tokenDueno}`)
      .expect(200);

    expect(res.body).toMatchObject({ channel: 'noop', ok: false, delivered: false });
  });

  it('el simulacro es del dueño: un admin operativo no lo dispara', async () => {
    await request
      .post('/healthz/alert-drill')
      .set('Authorization', `Bearer ${tokenOperativo}`)
      .expect(403);
  });

  it('sin sesión tampoco: no es un endpoint público como /healthz', async () => {
    await request.post('/healthz/alert-drill').expect(401);
  });
});

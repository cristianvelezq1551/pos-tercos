/**
 * E2E de aislamiento de sesiones admin/pos. En dev ambas apps comparten host
 * (localhost — las cookies NO distinguen puerto), así que el backend puede
 * recibir AMBAS cookies en un mismo request. Regla: con `X-Client-App`, SOLO
 * cuenta la cookie de esa app — el dueño logueado en admin y el cajero
 * logueado en el POS nunca se mezclan.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

function cookieValue(setCookies: string[], name: string): string {
  const found = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`Set-Cookie ${name} no encontrado en: ${setCookies.join(' | ')}`);
  return found.split(';')[0]!.split('=').slice(1).join('=');
}

describe('Aislamiento de sesiones admin/pos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let adminAccess: string;
  let adminRefresh: string;
  let posAccess: string;
  let posRefresh: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-iso@test.local',
          fullName: 'Dueño Iso',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-iso@test.local',
          fullName: 'Cajero Iso',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('login con X-Client-App setea SOLO las cookies de esa app', async () => {
    const adminLogin = await request
      .post('/auth/login')
      .set('X-Client-App', 'admin')
      .send({ email: 'dueno-iso@test.local', password: 'dev12345' })
      .expect(200);
    const adminCookies = adminLogin.get('Set-Cookie') ?? [];
    adminAccess = cookieValue(adminCookies, 'admin_access');
    adminRefresh = cookieValue(adminCookies, 'admin_refresh');
    expect(adminCookies.some((c) => c.startsWith('pos_'))).toBe(false);

    const posLogin = await request
      .post('/auth/login')
      .set('X-Client-App', 'pos')
      .send({ email: 'cajero-iso@test.local', password: 'dev12345' })
      .expect(200);
    const posCookies = posLogin.get('Set-Cookie') ?? [];
    posAccess = cookieValue(posCookies, 'pos_access');
    posRefresh = cookieValue(posCookies, 'pos_refresh');
    expect(posCookies.some((c) => c.startsWith('admin_'))).toBe(false);
  });

  it('con AMBAS cookies, X-Client-App=admin responde el DUEÑO (nunca el cajero)', async () => {
    const res = await request
      .get('/auth/me')
      .set('X-Client-App', 'admin')
      .set('Cookie', [`pos_access=${posAccess}`, `admin_access=${adminAccess}`])
      .expect(200);
    expect(res.body.email).toBe('dueno-iso@test.local');
    expect(res.body.role).toBe('DUENO');
  });

  it('con AMBAS cookies, X-Client-App=pos responde el CAJERO (nunca el dueño)', async () => {
    const res = await request
      .get('/auth/me')
      .set('X-Client-App', 'pos')
      .set('Cookie', [`admin_access=${adminAccess}`, `pos_access=${posAccess}`])
      .expect(200);
    expect(res.body.email).toBe('cajero-iso@test.local');
    expect(res.body.role).toBe('CAJERO');
  });

  it('con X-Client-App=admin y SOLO cookie del pos → 401 (no hay fallback cruzado)', async () => {
    await request
      .get('/auth/me')
      .set('X-Client-App', 'admin')
      .set('Cookie', [`pos_access=${posAccess}`])
      .expect(401);
  });

  it('el refresh de una app rota SOLO sus cookies y respeta su sesión', async () => {
    const res = await request
      .post('/auth/refresh')
      .set('X-Client-App', 'admin')
      .set('Cookie', [`admin_refresh=${adminRefresh}`, `pos_refresh=${posRefresh}`])
      .expect(200);
    const cookies = res.get('Set-Cookie') ?? [];
    expect(cookies.some((c) => c.startsWith('admin_access='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('pos_'))).toBe(false);

    // El access renovado sigue siendo del DUEÑO.
    const me = await request
      .get('/auth/me')
      .set('X-Client-App', 'admin')
      .set('Cookie', [`admin_access=${cookieValue(cookies, 'admin_access')}`])
      .expect(200);
    expect(me.body.role).toBe('DUENO');
  });

  it('Bearer token (KDS) sigue funcionando sin cookies', async () => {
    const token = await loginAs(request, 'cajero-iso@test.local');
    const res = await request
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.email).toBe('cajero-iso@test.local');
  });
});

/**
 * El día en que arranca el mes del negocio quedó FIJO (decisión del dueño
 * 2026-09-14, `CAMBIAR_INICIO_DE_MES_HABILITADO` en @pos-tercos/types).
 *
 * Esconder el campo de la pantalla no alcanza: el PATCH de configuración es
 * uno solo para todo (horario, domicilios, cuentas de pago…) y una llamada
 * suelta podría mover el corte. Y moverlo recalcula el estado financiero
 * entero de golpe —ingresos, COGS, nómina y la ventana de los costos fijos
 * cambian de mes a la vez—, o sea que reescribe el histórico con el que se
 * decide.
 *
 * Lo que se fija acá: el cambio se rechaza, reenviar el MISMO valor no es un
 * cambio (un cliente que mande la config entera no tiene por qué fallar) y el
 * resto de la configuración se sigue pudiendo editar.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('El mes del negocio no se puede mover desde la app', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const config = async () =>
    (await request.get('/business-config').set(auth()).expect(200)).body as {
      monthStartDay: number;
      orderRadiusKm: number;
    };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-mes@test.local',
        fullName: 'Dueño Mes',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-mes@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('cambiar el día se rechaza con un mensaje que se entiende, y la config no se mueve', async () => {
    const antes = await config();
    const r = await request
      .patch('/business-config')
      .set(auth())
      .send({ monthStartDay: antes.monthStartDay === 1 ? 15 : 1 })
      .expect(400);

    const msg = String((r.body as { message: string }).message);
    expect(msg).toMatch(/mes del negocio/i);
    expect(msg).toMatch(/no se puede cambiar/i);
    // Nada de nombres de campo ni de constantes en la pantalla (§3).
    expect(msg).not.toMatch(/monthStartDay|CAMBIAR_INICIO/i);

    expect((await config()).monthStartDay).toBe(antes.monthStartDay);
  });

  it('reenviar el MISMO día no es un cambio: pasa sin romper nada', async () => {
    const antes = await config();
    await request
      .patch('/business-config')
      .set(auth())
      .send({ monthStartDay: antes.monthStartDay })
      .expect(200);
    expect((await config()).monthStartDay).toBe(antes.monthStartDay);
  });

  it('el resto de la configuración se sigue editando', async () => {
    const antes = await config();
    const nuevo = antes.orderRadiusKm === 4 ? 5 : 4;
    await request.patch('/business-config').set(auth()).send({ orderRadiusKm: nuevo }).expect(200);
    const despues = await config();
    expect(despues.orderRadiusKm).toBe(nuevo);
    expect(despues.monthStartDay).toBe(antes.monthStartDay);
  });
});

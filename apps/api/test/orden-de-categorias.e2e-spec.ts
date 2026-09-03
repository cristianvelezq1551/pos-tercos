/**
 * orden-de-categorias.e2e-spec.ts — El orden que el dueño arma en
 * `/categories` manda en las DOS listas de venta: el catálogo de la caja
 * (`GET /products`) y la carta del cliente (`GET /web/menu`).
 *
 * Lo reportó el dueño: la caja abría con las bebidas y encontrar un plato
 * costaba. La tabla ya tenía `sortOrder` y las flechas del admin funcionaban,
 * pero nadie usaba ese orden: los dos endpoints ordenaban por NOMBRE, y
 * "Bebidas" gana por la B. En su local son 12 de 22 productos.
 *
 * El caso usa nombres cuyo orden alfabético es EL OPUESTO del configurado: si
 * alguien vuelve a ordenar por nombre, esto falla.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Orden de categorías E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;

  // Alfabéticamente: Aguas < Hamburguesas < Zumos. El dueño las quiere al
  // revés, con las bebidas al final.
  const ORDEN_DEL_DUENO = ['Hamburguesas', 'Zumos', 'Aguas'];

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('test1234', 4);
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'dueno-orden@test.local',
        passwordHash: hash,
        fullName: 'Dueño Orden',
        role: 'DUENO',
      },
    });
    duenoToken = await loginAs(request, 'dueno-orden@test.local', 'test1234');

    await prisma.productCategory.createMany({
      data: ORDEN_DEL_DUENO.map((name, i) => ({ id: randomUUID(), name, sortOrder: i })),
    });

    // Un producto por categoría, con nombres que tampoco ayudan al azar.
    for (const [i, category] of ORDEN_DEL_DUENO.entries()) {
      await prisma.product.create({
        data: {
          id: randomUUID(),
          name: `Producto ${i} de ${category}`,
          category,
          basePrice: 10000,
          isActive: true,
        },
      });
    }
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el catálogo de la caja sale en el orden del dueño, no en el alfabético', async () => {
    const res = await request
      .get('/products?only_active=true')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);

    const orden: string[] = [];
    for (const p of res.body as { category: string | null }[]) {
      if (p.category && !orden.includes(p.category)) orden.push(p.category);
    }
    expect(orden).toEqual(ORDEN_DEL_DUENO);
    // Y es distinto del alfabético: si no, el caso no probaría nada.
    expect(orden).not.toEqual([...ORDEN_DEL_DUENO].sort());
  });

  it('la carta del cliente sale en el mismo orden', async () => {
    const res = await request.get('/web/menu').expect(200);
    expect(res.body.categories).toEqual(ORDEN_DEL_DUENO);
  });

  it('cambiar el orden en el admin cambia las dos listas', async () => {
    const cats = await prisma.productCategory.findMany();
    const hamburguesas = cats.find((c) => c.name === 'Hamburguesas')!;
    // Las hamburguesas se van al final: quedan Zumos, Aguas, Hamburguesas.
    await request
      .patch(`/product-categories/${hamburguesas.id}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ sortOrder: 9 })
      .expect(200);

    const caja = await request
      .get('/products?only_active=true')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const orden: string[] = [];
    for (const p of caja.body as { category: string | null }[]) {
      if (p.category && !orden.includes(p.category)) orden.push(p.category);
    }
    expect(orden).toEqual(['Zumos', 'Aguas', 'Hamburguesas']);
    // La caja cambia en el acto. La carta del cliente la sigue con hasta 30 s
    // de retraso (`MENU_TTL_MS`): el menú público lo pega internet en cada
    // visita y se cachea a propósito. No se prueba acá para no dormir medio
    // minuto en el CI — el segundo caso ya fija que respeta el orden.
  });
});

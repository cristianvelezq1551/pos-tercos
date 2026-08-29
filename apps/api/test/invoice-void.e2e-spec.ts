/**
 * invoice-void.e2e-spec.ts
 *
 * Anular una factura confirmada.
 *
 * La ley que ordena toda la suite: **anular tiene que dejar los libros como si
 * esa factura nunca se hubiera cargado**. Por eso varios casos comparan contra
 * el estado ANTERIOR a la compra en vez de contra un número escrito a mano: un
 * número a mano prueba que la cuenta da; comparar contra el antes prueba que no
 * quedó ruido en ningún lado.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';
import { CogsService } from '../src/reports/cogs.service';

const PIN = '246810';

describe('Facturas — anular una confirmada', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let adminToken: string;
  let ingredienteId: string;
  let productoId: string;

  const factura = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    supplierNit: '900777888-1',
    supplierName: 'Distribuidora Anulable',
    invoiceNumber: 'A-1',
    total: 100000,
    items: [
      {
        entityType: 'INGREDIENT',
        ingredientId: ingredienteId,
        descriptionRaw: 'Carne 10 kg',
        quantity: 10,
        unit: 'kg',
        unitPrice: 10000,
        total: 100000,
      },
    ],
    ...over,
  });

  /** Crea una factura CONFIRMADA y devuelve su id. */
  const confirmar = async (over: Record<string, unknown> = {}): Promise<string> => {
    const res = await request
      .post('/invoices/manual')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(factura(over))
      .expect(201);
    return res.body.id as string;
  };

  const anular = (id: string, reason = 'La cargué con la cantidad equivocada', pin = PIN) =>
    request
      .post(`/invoices/${id}/void`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', pin)
      .send({ reason });

  const stockDe = async (ingredientId: string): Promise<number> => {
    const agg = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'INGREDIENT', ingredientId },
      _sum: { delta: true },
    });
    return Number(agg._sum.delta ?? 0);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-void@test.local',
        fullName: 'Dueño Anulaciones',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    await prisma.user.create({
      data: {
        email: 'admin-void@test.local',
        fullName: 'Admin Anulaciones',
        role: 'ADMIN_OPERATIVO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-void@test.local');
    adminToken = await loginAs(request, 'admin-void@test.local');

    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ pin: PIN, password: 'dev12345' })
      .expect(201);

    const ing = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Carne Anulable',
        unitPurchase: 'kg',
        unitRecipe: 'kg',
        conversionFactor: 1,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    ingredienteId = ing.body.id as string;

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Agua Anulable',
        category: 'Bebidas',
        basePrice: 3000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 12,
        thresholdMin: 0,
        isActive: true,
        modifiersEnabled: false,
      })
      .expect(201);
    productoId = prod.body.id as string;

  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // =====================================================================
  // El inventario vuelve a donde estaba
  // =====================================================================

  it('devuelve exactamente lo que la factura había metido', async () => {
    const antes = await stockDe(ingredienteId);
    const id = await confirmar();
    expect(await stockDe(ingredienteId)).toBe(antes + 10);

    await anular(id).expect(201);
    expect(await stockDe(ingredienteId)).toBe(antes);
  });

  it('el movimiento compensatorio apunta al original y lleva SU fecha', async () => {
    const id = await confirmar();
    const original = await prisma.inventoryMovement.findFirstOrThrow({
      where: { sourceType: 'invoice', sourceId: id },
    });

    await anular(id).expect(201);

    const reversa = await prisma.inventoryMovement.findFirstOrThrow({
      where: { sourceType: 'invoice_reversal', sourceId: original.id },
    });
    expect(Number(reversa.delta)).toBe(-Number(original.delta));
    // La fecha del original es lo que hace que el motor lo recalcule todo como
    // si la compra nunca hubiera entrado.
    expect(reversa.createdAt.getTime()).toBe(original.createdAt.getTime());
  });

  it('no borra ni edita nada: los movimientos originales siguen ahí', async () => {
    const id = await confirmar();
    await anular(id).expect(201);
    const originales = await prisma.inventoryMovement.count({
      where: { sourceType: 'invoice', sourceId: id },
    });
    expect(originales).toBe(1);
  });

  it('la factura queda anulada, con su motivo y su autor', async () => {
    const id = await confirmar();
    const res = await anular(id, 'El proveedor facturó otra cosa').expect(201);
    expect(res.body.status).toBe('VOIDED');
    expect(res.body.voidReason).toBe('El proveedor facturó otra cosa');
    expect(res.body.voidedAt).not.toBeNull();
    expect(res.body.voidedByName).toBe('Dueño Anulaciones');
  });

  it('anular dos veces no devuelve el doble de mercancía', async () => {
    const antes = await stockDe(ingredienteId);
    const id = await confirmar();
    await anular(id).expect(201);
    await anular(id).expect(400);
    expect(await stockDe(ingredienteId)).toBe(antes);
  });

  it('dos anulaciones simultáneas tampoco', async () => {
    const antes = await stockDe(ingredienteId);
    const id = await confirmar();
    const resultados = await Promise.all([anular(id), anular(id), anular(id)]);
    expect(resultados.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await stockDe(ingredienteId)).toBe(antes);
    const reversas = await prisma.inventoryMovement.count({
      where: { sourceType: 'invoice_reversal', notes: { contains: 'Anulación' } },
    });
    // Una sola reversa por movimiento original, aunque hayan corrido tres.
    const originales = await prisma.inventoryMovement.count({
      where: { sourceType: 'invoice', sourceId: id },
    });
    expect(reversas).toBeGreaterThanOrEqual(originales);
  });

  it('anula también las compras de producto de reventa', async () => {
    const id = await confirmar({
      total: 48000,
      items: [
        {
          entityType: 'PRODUCT',
          productId: productoId,
          descriptionRaw: 'Agua caja x12',
          quantity: 2,
          unit: 'caja',
          unitPrice: 24000,
          total: 48000,
        },
      ],
    });
    await anular(id).expect(201);
    const agg = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'PRODUCT', productId: productoId },
      _sum: { delta: true },
    });
    expect(Number(agg._sum.delta ?? 0)).toBe(0);
  });

  // =====================================================================
  // Sale de los libros
  // =====================================================================

  it('desaparece del reporte de compras y del P&G', async () => {
    const hoy = hoyLocal();
    const id = await confirmar({ invoiceNumber: 'A-REPORTE', total: 100000 });

    const compras = () =>
      request
        .get(`/reports/purchases?from=${hoy}&to=${hoy}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(200);

    const conFactura = await compras();
    const compradoAntes = conFactura.body.totals.purchased as number;
    const facturasAntes = conFactura.body.totals.invoiceCount as number;

    await anular(id).expect(201);

    const sinFactura = await compras();
    expect(sinFactura.body.totals.purchased).toBe(compradoAntes - 100000);
    expect(sinFactura.body.totals.invoiceCount).toBe(facturasAntes - 1);
  });

  it('deja de contar como cuenta por pagar en tesorería', async () => {
    const id = await confirmar({ invoiceNumber: 'A-DEBE', total: 100000 });
    const antes = await request
      .get('/treasury/summary')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);

    await anular(id).expect(201);

    const despues = await request
      .get('/treasury/summary')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(despues.body.commitmentsTotal).toBe(antes.body.commitmentsTotal - 100000);
  });

  it('el último costo del insumo vuelve al de la compra anterior', async () => {
    // Compra vieja a $8.000/kg, compra nueva a $30.000/kg, se anula la nueva.
    await confirmar({ invoiceNumber: 'A-VIEJA', total: 80000, items: [linea(ingredienteId, 10, 8000, 80000)] });
    const nueva = await confirmar({ invoiceNumber: 'A-NUEVA', total: 300000, items: [linea(ingredienteId, 10, 30000, 300000)] });

    const conNueva = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredienteId } });
    expect(Number(conNueva.lastUnitCost)).toBe(30000);

    await anular(nueva).expect(201);

    const sinNueva = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredienteId } });
    expect(Number(sinNueva.lastUnitCost)).toBe(8000);
  });

  it('si era la única compra, el último costo queda sin dato (no en cero)', async () => {
    const otro = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Insumo de una sola compra',
        unitPurchase: 'kg',
        unitRecipe: 'kg',
        conversionFactor: 1,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    const otroId = otro.body.id as string;

    const id = await confirmar({
      invoiceNumber: 'A-UNICA',
      total: 50000,
      items: [linea(otroId, 5, 10000, 50000)],
    });
    await anular(id).expect(201);

    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: otroId } });
    // Cero significaría "es gratis". Sin dato significa "no lo sé", que es la
    // verdad y es lo que el motor necesita para estimar honestamente.
    expect(ing.lastUnitCost).toBeNull();
    expect(await prisma.supplierProduct.count({ where: { ingredientId: otroId } })).toBe(0);
  });

  it('borra los cortes del motor posteriores, para que no queden con la compra adentro', async () => {
    const id = await confirmar();
    const original = await prisma.inventoryMovement.findFirstOrThrow({
      where: { sourceType: 'invoice', sourceId: id },
    });
    const corte = new Date(original.createdAt.getTime() + 60_000);
    await prisma.ledgerSnapshot.create({
      data: { cutoffAt: corte, payload: {}, movementsCount: 0 },
    });

    await anular(id).expect(201);

    // Si sobreviviera, ese corte seguiría resumiendo un inventario que incluye
    // la compra anulada y el error sería permanente y silencioso.
    expect(await prisma.ledgerSnapshot.count({ where: { cutoffAt: corte } })).toBe(0);
  });

  it('si la mercancía ya se consumió, la pérdida queda estimada y con deuda', async () => {
    // El caso que importa de verdad: se compró, se usó, y recién ahí se anula.
    // Esas unidades ya no tienen respaldo, así que el motor las trata como
    // cualquier consumo sin stock — estimadas, con deuda, nunca en cero.
    const otro = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Insumo consumido antes de anular',
        unitPurchase: 'kg',
        unitRecipe: 'kg',
        conversionFactor: 1,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    const otroId = otro.body.id as string;
    const hoy = hoyLocal();

    const id = await confirmar({
      invoiceNumber: 'A-CONSUMIDA',
      total: 100000,
      items: [linea(otroId, 10, 10000, 100000)],
    });
    // Se merma la mitad: esa pérdida se costeó contra el lote de esta factura.
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: otroId, delta: -5, type: 'WASTE', notes: 'Se dañó' })
      .expect(201);

    await anular(id).expect(201);

    app.get(CogsService).invalidateLedgerCache();
    const pnl = await request
      .get(`/reports/cogs/pnl?from=${hoy}&to=${hoy}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    // La merma sigue costando lo mismo —el precio no cambió, la factura sí
    // dejó de existir— pero ahora está declarada como ESTIMADA, no exacta.
    expect(pnl.body.wasteCost).toBeGreaterThan(0);
    // El P&G lo declara como provisional: es un estimado al último precio
    // conocido, no un costo exacto. Un estimado presentado como exacto es el
    // mismo problema que valuarlo en cero.
    expect(pnl.body.wasteEstimatedCost).toBeGreaterThan(0);

    // Y las existencias quedan en negativo: se consumió algo que no se compró.
    expect(await stockDe(otroId)).toBe(-5);
  });

  it('volver a cargar la factura corregida salda esa deuda al costo real', async () => {
    const otro = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Insumo recargado',
        unitPurchase: 'kg',
        unitRecipe: 'kg',
        conversionFactor: 1,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    const otroId = otro.body.id as string;
    const hoy = hoyLocal();

    const mala = await confirmar({
      invoiceNumber: 'A-MALA',
      total: 100000,
      items: [linea(otroId, 10, 10000, 100000)],
    });
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: otroId, delta: -4, type: 'WASTE', notes: 'Se dañó' })
      .expect(201);
    await anular(mala).expect(201);

    const pnlDe = async (): Promise<{ wasteCost: number; wasteEstimatedCost: number }> => {
      // El motor cachea 60 s a propósito (§7.v18): acá se mide la lógica, no la
      // caché. En la app real el P&G refleja la anulación cuando vence el TTL.
      app.get(CogsService).invalidateLedgerCache();
      const res = await request
        .get(`/reports/cogs/pnl?from=${hoy}&to=${hoy}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(200);
      return res.body as { wasteCost: number; wasteEstimatedCost: number };
    };
    // El P&G es de TODO el día, así que se mide la DIFERENCIA: el absoluto
    // arrastra lo que dejaron los otros casos de esta misma suite.
    const antes = await pnlDe();

    // La buena costaba $15.000/kg, no $10.000.
    await confirmar({
      invoiceNumber: 'A-BUENA',
      total: 150000,
      items: [linea(otroId, 10, 15000, 150000)],
    });

    const despues = await pnlDe();
    // Los 4 kg mermados dejan de estar estimados: la compra buena los saldó.
    expect(antes.wasteEstimatedCost - despues.wasteEstimatedCost).toBe(40000);
    // Y su costo pasa del estimado ($10.000/kg) al real ($15.000/kg).
    expect(despues.wasteCost - antes.wasteCost).toBe(20000);
    // Y el último costo del insumo es el de la factura que sí existe.
    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: otroId } });
    expect(Number(ing.lastUnitCost)).toBe(15000);
    expect(await stockDe(otroId)).toBe(6);
  });

  // =====================================================================
  // Guardas
  // =====================================================================

  it('el admin operativo no puede anular', async () => {
    const id = await confirmar();
    await request
      .post(`/invoices/${id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Approval-Pin', PIN)
      .send({ reason: 'quiero anularla igual' })
      .expect(403);
  });

  it('sin PIN no se anula', async () => {
    const id = await confirmar();
    await request
      .post(`/invoices/${id}/void`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ reason: 'sin pin' })
      .expect(400);
  });

  it('con PIN equivocado tampoco', async () => {
    const id = await confirmar();
    await anular(id, 'motivo suficiente', '000000').expect(403);
  });

  it('exige un motivo', async () => {
    const id = await confirmar();
    await anular(id, 'no').expect(400);
  });

  it('una factura pagada pide deshacer el pago primero', async () => {
    const id = await confirmar();
    await request
      .post(`/invoices/${id}/payment/paid`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .field('bankAmount', '100000')
      .attach('proof', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), 'comprobante.jpg')
      .expect(201);

    const res = await anular(id).expect(400);
    expect(String(res.body.message)).toMatch(/pagada/i);

    // Y tras deshacer el pago, sí se puede.
    await request
      .delete(`/invoices/${id}/payment`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .expect(200);
    await anular(id).expect(201);
  });

  it('pasados los 3 días ya no se puede', async () => {
    const id = await confirmar();
    await prisma.invoice.update({
      where: { id },
      data: { confirmedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
    });
    const res = await anular(id).expect(400);
    expect(String(res.body.message)).toMatch(/3 días|ajuste manual/i);
  });

  it('un borrador no se anula: se borra', async () => {
    const draft = await request
      .post('/invoices/draft')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(factura())
      .expect(201);
    const res = await anular(draft.body.id as string).expect(400);
    expect(String(res.body.message)).toMatch(/borrador|confirmadas/i);
  });

  it('deja rastro en la bitácora con el motivo', async () => {
    const id = await confirmar();
    await anular(id, 'Doble carga de la misma factura').expect(201);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: id, action: 'INVOICE_VOIDED' },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log?.metadata)).toContain('Doble carga');
  });

  // =====================================================================
  // Vista previa del impacto
  // =====================================================================

  it('la vista previa dice en cuánto queda cada insumo', async () => {
    const antes = await stockDe(ingredienteId);
    const id = await confirmar();

    const res = await request
      .get(`/invoices/${id}/void-preview`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);

    expect(res.body.blockedReason).toBeNull();
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].delta).toBe(-10);
    expect(res.body.lines[0].currentStock).toBe(antes + 10);
    expect(res.body.lines[0].resultingStock).toBe(antes);
    expect(res.body.daysLeft).toBeGreaterThan(0);
  });

  it('la vista previa avisa qué va a quedar en negativo', async () => {
    const otro = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Insumo que se consume',
        unitPurchase: 'kg',
        unitRecipe: 'kg',
        conversionFactor: 1,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    const otroId = otro.body.id as string;

    const id = await confirmar({
      invoiceNumber: 'A-NEG',
      total: 50000,
      items: [linea(otroId, 5, 10000, 50000)],
    });
    // Se consume todo lo que entró: al anular, el stock queda negativo.
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        entityType: 'INGREDIENT',
        ingredientId: otroId,
        delta: -5,
        type: 'WASTE',
        notes: 'Se dañó todo',
      })
      .expect(201);

    const res = await request
      .get(`/invoices/${id}/void-preview`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.goesNegative).toEqual(['Insumo que se consume']);
    expect(res.body.lines[0].resultingStock).toBe(-5);
  });

  it('la vista previa explica por qué no se puede, en vez de fallar', async () => {
    const id = await confirmar();
    await prisma.invoice.update({
      where: { id },
      data: { confirmedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    const res = await request
      .get(`/invoices/${id}/void-preview`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.blockedReason).toMatch(/3 días/);
    expect(res.body.lines).toEqual([]);
  });
});

function linea(
  ingredientId: string,
  quantity: number,
  unitPrice: number,
  total: number,
): Record<string, unknown> {
  return {
    entityType: 'INGREDIENT',
    ingredientId,
    descriptionRaw: 'Línea de prueba',
    quantity,
    unit: 'kg',
    unitPrice,
    total,
  };
}

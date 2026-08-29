/**
 * Motor de la simulación: elige una operación al azar, la ejecuta contra la
 * API y anota en el modelo sombra lo que ESA operación debió producir.
 *
 * El invariante de diseño: la sombra nunca lee un número de la app para
 * decidir qué esperar. Los precios, las recetas y las cantidades los eligió el
 * test; el costo FIFO lo lleva su propia cola. Lo único que se toma de la
 * respuesta son los identificadores (id de venta, de movimiento) y el total
 * cobrado, que además se verifica contra el total calculado a mano.
 */
import { randomUUID } from 'crypto';
import {
  ColaFifo,
  cantidadBruta,
  consumoDeProduccion,
  consumoDeUnaUnidad,
  claveDe,
  type Lote,
  type ProductoSombra,
} from './shadow';
import type { Rng } from './rng';
import { descuentoDeLinea } from './promos';
import { esperar, PIN, type Mundo } from './world';

/**
 * Plata que se COBRA o se descuenta: peso ENTERO. El peso colombiano no tiene
 * centavos en la operación, y el repo lo formaliza en `roundMoney`. Un total
 * fraccionario haría imposible cuadrar una cuenta dividida en partes enteras.
 */
const redondearPeso = (n: number): number => Math.round(n);

/**
 * COSTOS del ledger FIFO: 4 decimales (`roundCost`). Van finos a propósito —
 * con gramos y mililitros, redondear el costo unitario a peso entero
 * acumularía error a cada multiplicación. La regla del repo es explícita: lo
 * que se COBRA va entero, lo que CUESTA va fino.
 */
const redondearCosto = (n: number): number => Math.round(n * 10_000) / 10_000;

interface VentaRegistrada {
  id: string;
  total: number;
  deliveryFee: number;
  /** Costo FIFO que la sombra calculó para esta venta. */
  costo: number;
  /** Descuento total concedido (promoción + manual de línea + manual de total). */
  descuento: number;
  /**
   * Composición actual. Guarda el precio unitario y el descuento con que se
   * COBRÓ cada línea: al editar, una línea de la misma identidad conserva ese
   * precio y su descuento se escala por unidad (lo ya cobrado no se re-precia).
   */
  lineas: Array<{
    productoId: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
  }>;
  /** Consumo actual por stockable, base para calcular la DIFERENCIA al editar. */
  consumo: Map<string, number>;
  /** True si la venta se puede editar sin ambigüedad (ver `editar`). */
  editable: boolean;
  /** Ya pasó por "marcar listo" (los pedidos web avanzan solos su ciclo). */
  despachado?: boolean;
  /** Qué lote salió de cada stockable, para poder devolverlo si se anula. */
  tomas: Map<string, Lote[]>;
  /** Cuánto de esta venta se cobró en efectivo (neto de envío). */
  efectivo: number;
  metodos: Array<{ method: string; amount: number }>;
  /**
   * Cuánto del envío se devolvería EN EFECTIVO si el pedido se cae. El envío
   * nunca entró al cajón (se le paga al domiciliario al entregar), pero al
   * anular se le devuelve al cliente de la caja: sin ese egreso el arqueo
   * marcaría un sobrante por el valor del envío.
   */
  devolucionEnvioEfectivo: number;
  estado: 'PAGADO' | 'VOID' | 'REEMBOLSADO';
}

/** Una línea del pedido tal como la compuso la simulación. */
interface LineaSimulada {
  producto: ProductoSombra;
  cantidad: number;
  /** Precio de UNA unidad ya con tamaño y extras. */
  precioUnitario: number;
  sizeId?: string;
  extras?: string[];
  /** Consumo EXTRA por unidad que agregan el tamaño y los extras. */
  consumoExtra: Map<string, number>;
  manual?: { kind: 'FIXED' | 'PERCENT'; value: number };
  esPromo?: boolean;
  descuento: (bruto: number) => number;
}

/** Pedido creado pero todavía sin cobrar (base de una cuenta abierta). */
export interface VentaPreparada {
  saleId: string;
  lineas: Array<{
    productoId: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
  }>;
  necesidad: Map<string, number>;
  descuentoLineas: number;
  descuentoOrden: number;
  descuentoPromo: number;
  envio: number;
  /** Total ya cobrable (incluye el envío si lo hay). */
  total: number;
  /** Alguna línea lleva tamaño o extras (ver `editable`). */
  conOpciones: boolean;
  /** Ninguna línea trae descuento manual (ver `editable`). */
  sinDescuentoManual: boolean;
}

interface CortesiaRegistrada {
  id: string;
  costo: number;
  tomas: Map<string, Lote[]>;
  revertida: boolean;
}

interface MermaRegistrada {
  movementId: string;
  clave: string;
  cantidad: number;
  costo: number;
  tomas: Lote[];
  /** Cuánto de esa merma ya se devolvió por anulación. */
  devuelto: number;
}

export class Simulacion {
  /** Cola FIFO sombra por stockable. */
  readonly colas = new Map<string, ColaFifo>();
  /** Unidades que la sombra espera en stock (independiente del valor). */
  readonly unidades = new Map<string, number>();

  readonly ventas: VentaRegistrada[] = [];
  readonly mermas: MermaRegistrada[] = [];
  readonly cortesias: CortesiaRegistrada[] = [];
  /** Cuentas abiertas sin cobrar. No aportan ingreso ni consumen stock. */
  cuentasAbiertas: VentaPreparada[] = [];
  /** Ventas que se editaron: su precio quedó congelado, no re-cotizado. */
  readonly editadas = new Set<string>();
  /** Domicilios que llegaron a manos del cliente (cierran en ENTREGADO). */
  readonly entregados: string[] = [];
  /** Pedidos hechos por el cliente en la web, con el ciclo ya recorrido. */
  readonly pedidosWeb: Array<{ id: string; domicilio: boolean }> = [];

  /** Libros agregados que se contrastan contra el P&G y el resumen de ventas. */
  ingreso = 0;
  descuentos = 0;
  envioCobrado = 0;
  envioPedidos = 0;
  cogs = 0;
  costoMerma = 0;
  costoCortesia = 0;
  costoReembolso = 0;
  compras = 0;
  /**
   * Valor del inventario que se fue por un faltante detectado al CONTAR.
   * Se lleva aparte porque el ledger no lo atribuye a ninguna línea de pérdida:
   * sale del libro y no aparece ni en el costo de lo vendido ni en la merma.
   */
  faltantesPorConteo = 0;
  /** Flete que cobró el proveedor por traer la mercancía (no encarece lotes). */
  fletes = 0;
  /** Facturas: cuántas trajeron flete y cuánta mercancía se compró por ellas. */
  facturasConFlete = 0;
  comprasFacturadas = 0;
  /** Descuento otorgado por promociones automáticas (aparte del manual). */
  descuentoPromos = 0;
  cajaEntradas = 0;
  cajaSalidas = 0;
  efectivoDeVentas = 0;
  /** Contadores para el resumen del informe. */
  readonly conteo: Record<string, number> = {};

  constructor(
    readonly m: Mundo,
    private readonly rng: Rng,
  ) {}

  private cola(clave: string): ColaFifo {
    let c = this.colas.get(clave);
    if (!c) {
      c = new ColaFifo();
      this.colas.set(clave, c);
    }
    return c;
  }

  stock(clave: string): number {
    return this.unidades.get(clave) ?? 0;
  }

  private mover(clave: string, delta: number): void {
    this.unidades.set(clave, this.stock(clave) + delta);
  }

  private cuenta(op: string): void {
    this.conteo[op] = (this.conteo[op] ?? 0) + 1;
  }

  // ==================================================================
  // Entradas de stock
  // ==================================================================

  /** Items que ya gastaron su "stock inicial" (la API solo admite uno). */
  private readonly conInicial = new Set<string>();

  /** Compra/entrada valorizada: crea lote FIFO y suma al comprado. */
  async entrada(
    entityType: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT',
    id: string,
    qty: number,
    unitCost: number,
  ): Promise<void> {
    // El "stock inicial" es irrepetible por item (es la foto de arranque);
    // las reposiciones siguientes entran como ajuste, igual que en la app.
    const tipo = this.conInicial.has(claveDe(entityType, id))
      ? 'MANUAL_ADJUSTMENT'
      : 'INITIAL';
    this.conInicial.add(claveDe(entityType, id));
    const campo =
      entityType === 'INGREDIENT' ? 'ingredientId'
      : entityType === 'PRODUCT' ? 'productId'
      : 'subproductId';
    await esperar(
      this.m.request
      .post('/inventory/movements')
      .set(this.m.auth())
      .send({ entityType, [campo]: id, delta: qty, type: tipo, unitCost }),
      201,
    );
    const clave = claveDe(entityType, id);
    this.cola(clave).entrada(qty, unitCost);
    this.mover(clave, qty);
    this.compras += redondearCosto(qty * unitCost);
    this.cuenta('entrada');
  }

  /** Repone lo que falte para que una operación no deje stock negativo. */
  private async garantizarStock(necesidad: Map<string, number>): Promise<void> {
    for (const [clave, qty] of necesidad) {
      if (this.stock(clave) >= qty) continue;
      const [tipo, id] = clave.split(':') as ['INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT', string];
      if (tipo === 'SUBPRODUCT') {
        // Un subproducto no se compra: se produce. Producir también consume,
        // así que la recursión termina reponiendo los insumos de su receta.
        const sub = this.m.subproductos.find((s) => s.id === id)!;
        const faltan = qty - this.stock(clave);
        await this.producir(sub.id, Math.max(sub.yield, Math.ceil(faltan / sub.yield) * sub.yield));
        continue;
      }
      const falta = qty - this.stock(clave) + this.rng.int(50, 500);
      await this.entrada(tipo, id, falta, this.rng.int(5, 60));
    }
  }

  // ==================================================================
  // Producción de subproductos
  // ==================================================================

  /**
   * Repone los insumos que hacen falta para producir `cantidad` de un
   * subproducto, sin producir. La usan las leyes que corren DESPUÉS del bucle,
   * cuando el inventario ya quedó donde lo dejó la operación del día.
   */
  async asegurarInsumosParaProducir(subproductId: string, cantidad: number): Promise<void> {
    const sub = this.m.subproductos.find((x) => x.id === subproductId)!;
    await this.garantizarStock(consumoDeProduccion(sub, cantidad));
  }

  async producir(subproductId: string, cantidad: number): Promise<void> {
    const sub = this.m.subproductos.find((s) => s.id === subproductId)!;
    const necesidad = consumoDeProduccion(sub, cantidad);
    await this.garantizarStock(necesidad);

    await esperar(
      this.m.request
      .post(`/subproducts/${subproductId}/produce`)
      .set(this.m.auth())
      .send({ quantityProduced: cantidad, idempotencyKey: randomUUID() }),
      201,
    );

    // Costo del lote producido = suma FIFO de lo consumido / unidades. Es la
    // regla documentada; si el lote naciera barato, ese descuento se arrastra
    // a todo lo que se venda con él.
    let costoInsumos = 0;
    for (const [clave, qty] of necesidad) {
      const { costo } = this.cola(clave).salida(qty);
      costoInsumos += costo;
      this.mover(clave, -qty);
    }
    const clave = claveDe('SUBPRODUCT', subproductId);
    // El costo del lote se redondea a 4 decimales, igual que `roundCost` en el
    // ledger. Sin redondear, la diferencia por unidad es minúscula pero se
    // amplifica al consumir miles de gramos y el oráculo empieza a discrepar
    // por un motivo que no es un error del sistema.
    this.cola(clave).entrada(cantidad, redondearCosto(costoInsumos / cantidad));
    this.mover(clave, cantidad);
    this.cuenta('produccion');
  }

  // ==================================================================
  // Venta
  // ==================================================================

  /**
   * Crea el pedido (sin cobrarlo) y devuelve todo lo que hace falta para
   * cobrarlo después. Está separado del cobro porque una CUENTA ABIERTA vive
   * justamente en ese hueco: el pedido existe, la cocina ya lo preparó y la
   * plata todavía no entró. Mientras siga sin cobrarse no puede aportar ni un
   * peso a los ingresos ni descontar una sola unidad de stock.
   */
  private async crearPedido(opciones: {
    domicilio?: boolean;
    cuentaAbierta?: boolean;
  }): Promise<VentaPreparada> {
    const lineas = this.armarLineas();
    const necesidad = new Map<string, number>();
    for (const l of lineas) {
      for (const [clave, qty] of consumoDeUnaUnidad(l.producto, this.m.catalogo)) {
        necesidad.set(clave, (necesidad.get(clave) ?? 0) + qty * l.cantidad);
      }
      // El tamaño y los extras se suman ENCIMA de la receta del producto.
      for (const [clave, qty] of l.consumoExtra) {
        necesidad.set(clave, (necesidad.get(clave) ?? 0) + qty * l.cantidad);
      }
    }
    await this.garantizarStock(necesidad);

    // --- Total esperado, calculado a mano ---
    let subtotal = 0;
    let descuentoLineas = 0;
    let descuentoPromo = 0;
    for (const l of lineas) {
      const bruto = l.precioUnitario * l.cantidad;
      subtotal += bruto;
      const desc = l.descuento(bruto);
      descuentoLineas += desc;
      if (l.esPromo) descuentoPromo += desc;
    }
    const baseOrden = subtotal - descuentoLineas;
    const descuentoOrden = this.descuentoOrden ? this.descuentoOrden(baseOrden) : 0;
    const envio = opciones.domicilio ? this.rng.money(3000, 9000) : 0;

    // Un envío solo existe en un pedido a domicilio: `PATCH /delivery-fee`
    // rechaza el mostrador a propósito (el mostrador no tiene a dónde llevar).
    const body: Record<string, unknown> = {
      type: opciones.domicilio ? 'WEB_DELIVERY' : 'COUNTER',
      ...(opciones.domicilio
        ? {
            customerName: 'Cliente Simulación',
            customerPhone: '+573001112233',
            deliveryAddress: 'Calle 100 # 20-30, Bogotá',
          }
        : {}),
      ...(opciones.cuentaAbierta
        ? { openTab: true, customerName: 'Mesa Simulación' }
        : {}),
      items: lineas.map((l) => ({
        productId: l.producto.id,
        quantity: l.cantidad,
        ...(l.sizeId ? { sizeId: l.sizeId } : {}),
        ...(l.extras && l.extras.length > 0
          ? { modifiers: l.extras.map((modifierId) => ({ modifierId })) }
          : {}),
        ...(l.manual ? { manualDiscount: l.manual } : {}),
      })),
    };
    if (this.ordenManual) body.orderDiscount = this.ordenManual;
    if (this.ordenManual || lineas.some((l) => l.manual)) {
      body.discountReason = 'Simulación de descuento manual';
    }

    const creada = await esperar(
      this.m.request
        .post('/sales')
        .set(this.m.auth())
        .set('Idempotency-Key', randomUUID())
        .send(body),
      201,
    );
    const saleId = creada.body.id as string;

    if (envio > 0) {
      await esperar(
        this.m.request.patch(`/sales/${saleId}/delivery-fee`).set(this.m.auth()).send({ fee: envio }),
        200,
      );
    }

    // El total que devolvió la API tiene que coincidir con el de la sombra.
    const totalSinEnvio = redondearPeso(baseOrden - descuentoOrden);
    if (Math.abs(Number(creada.body.total) - totalSinEnvio) > 0.011) {
      throw new Error(
        `El total de la venta no coincide con el calculado a mano: ` +
          `API=${creada.body.total} sombra=${totalSinEnvio} (venta ${saleId})`,
      );
    }

    for (const l of lineas) {
      if (l.sizeId) this.cuenta('linea-con-tamano');
      if ((l.extras?.length ?? 0) > 0) this.cuenta('linea-con-extras');
      if (l.consumoExtra.size > 0) this.cuenta('linea-que-consume-extra');
    }

    return {
      saleId,
      lineas: lineas.map((l) => ({
        productoId: l.producto.id,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuento: l.descuento(l.precioUnitario * l.cantidad),
      })),
      necesidad,
      descuentoLineas,
      descuentoOrden,
      descuentoPromo,
      envio,
      total: redondearPeso(Number(creada.body.total) + envio),
      conOpciones: lineas.some((l) => l.sizeId !== undefined || (l.extras?.length ?? 0) > 0),
      sinDescuentoManual: lineas.every((l) => l.manual === undefined),
    };
  }

  /** Cobra un pedido ya creado y anota todo lo que esa plata mueve. */
  private async cobrar(prep: VentaPreparada): Promise<VentaRegistrada> {
    // El stock se descuenta al COBRAR, no al crear: entre una cosa y la otra
    // pudo consumirse en otra operación (el caso real de la cuenta abierta).
    await this.garantizarStock(prep.necesidad);

    const pago = this.armarPago(prep.total);
    await esperar(
      this.m.request
        .post(`/sales/${prep.saleId}/confirm-payment`)
        .set(this.m.auth())
        .send(pago.body),
      201,
    );

    // --- Consumo y costo FIFO sombra ---
    let costo = 0;
    const tomas = new Map<string, Lote[]>();
    for (const [clave, qty] of prep.necesidad) {
      const r = this.cola(clave).salida(qty);
      costo += r.costo;
      tomas.set(clave, r.tomas);
      this.mover(clave, -qty);
    }

    const { total, envio } = prep;
    const efectivoBruto = pago.metodos
      .filter((p) => p.method === 'CASH')
      .reduce((acc, p) => acc + p.amount, 0);
    // El envío NO entra al cajón: se le paga al domiciliario al entregar
    // (§7.v30). Se descuenta prorrateado por la parte que pagó cada medio.
    const efectivoNeto = total > 0 ? efectivoBruto - (envio * efectivoBruto) / total : 0;

    // Prorrateo del envío por parte de pago, con el remanente del redondeo en
    // la última parte para que las devoluciones sumen el envío exacto.
    let asignado = 0;
    const devolucionEnvioEfectivo = pago.metodos.reduce((acc, parte, i) => {
      const bruta =
        i === pago.metodos.length - 1
          ? redondearPeso(envio - asignado)
          : redondearPeso(total > 0 ? (parte.amount * envio) / total : 0);
      asignado = redondearPeso(asignado + bruta);
      return parte.method === 'CASH' ? acc + bruta : acc;
    }, 0);

    const descuento = prep.descuentoLineas + prep.descuentoOrden;
    const venta: VentaRegistrada = {
      id: prep.saleId,
      total,
      deliveryFee: envio,
      costo: redondearCosto(costo),
      tomas,
      efectivo: efectivoNeto,
      metodos: pago.metodos,
      descuento,
      lineas: prep.lineas,
      consumo: new Map(prep.necesidad),
      // Editar reajusta el pago ÚNICO al nuevo total; con la cuenta dividida el
      // backend rechaza (400) si el total cambia. Y un descuento manual o un
      // envío meten variables que no aportan a lo que esa operación mide.
      // Editar reajusta el pago ÚNICO al nuevo total (con cuenta dividida el
      // backend rechaza si el total cambia), y no rearma tamaño ni extras. Un
      // descuento MANUAL sobre el total se recalcularía sobre la base nueva y
      // mezclaría dos reglas; las promociones sí entran, porque su congelado es
      // justo lo que interesa medir.
      editable:
        pago.metodos.length === 1 &&
        envio === 0 &&
        prep.descuentoOrden === 0 &&
        prep.sinDescuentoManual &&
        prep.conOpciones === false,
      devolucionEnvioEfectivo: envio > 0 ? devolucionEnvioEfectivo : 0,
      estado: 'PAGADO',
    };
    this.ventas.push(venta);
    this.ingreso += total - envio;
    this.descuentos += descuento;
    this.descuentoPromos += prep.descuentoPromo;
    if (envio > 0) {
      this.envioCobrado += envio;
      this.envioPedidos += 1;
    }
    this.cogs += venta.costo;
    this.efectivoDeVentas += efectivoNeto;
    this.cuenta(envio > 0 ? 'venta-domicilio' : 'venta');
    return venta;
  }

  /** Arma, cobra y contabiliza una venta en un solo paso. */
  async vender(opciones: { domicilio?: boolean } = {}): Promise<VentaRegistrada> {
    return this.cobrar(await this.crearPedido(opciones));
  }

  /** Abre una cuenta: el pedido queda sin cobrar hasta que el cliente se vaya. */
  async abrirCuenta(): Promise<void> {
    this.cuentasAbiertas.push(await this.crearPedido({ cuentaAbierta: true }));
    this.cuenta('cuenta-abierta');
  }

  /** Cobra una cuenta abierta (recién ahí entra la plata y sale el stock). */
  async cobrarCuenta(prep: VentaPreparada): Promise<void> {
    await this.cobrar(prep);
    this.cuentasAbiertas = this.cuentasAbiertas.filter((c) => c.saleId !== prep.saleId);
    this.cuenta('cuenta-cobrada');
  }

  /** Descuento manual sobre el total de la orden en curso (si lo hubo). */
  private ordenManual: { kind: 'FIXED' | 'PERCENT'; value: number } | null = null;
  private descuentoOrden: ((base: number) => number) | null = null;

  private armarLineas(): LineaSimulada[] {
    const elegidos = this.rng.sample(this.m.productos, this.rng.int(1, 3));
    const intentarDescuentoManual = this.rng.chance(0.25);

    this.ordenManual = null;
    this.descuentoOrden = null;
    if (intentarDescuentoManual && this.rng.chance(0.5)) {
      const kind = this.rng.pick(['FIXED', 'PERCENT'] as const);
      const value = kind === 'PERCENT' ? this.rng.int(5, 30) : this.rng.money(500, 3000);
      this.ordenManual = { kind, value };
      this.descuentoOrden = (base: number): number =>
        redondearPeso(Math.min(kind === 'PERCENT' ? (base * value) / 100 : value, base));
    }

    // --- Primera pasada: opciones elegidas y descuento manual por línea ---
    const borrador = elegidos.map((producto) => {
      // Hasta 4: un 2x1 necesita 3 unidades para completar un set, así que con
      // un tope de 2 esa promoción nunca se probaría.
      const cantidad = this.rng.int(1, 4);
      const opciones = this.elegirOpciones(producto);
      const conManual =
        intentarDescuentoManual && !this.ordenManual && this.rng.chance(0.6);
      if (!conManual) return { producto, cantidad, ...opciones, manual: undefined };
      const kind = this.rng.pick(['FIXED', 'PERCENT'] as const);
      const value =
        kind === 'PERCENT'
          ? this.rng.int(5, 40)
          : this.rng.money(300, opciones.precioUnitario);
      return { producto, cantidad, ...opciones, manual: { kind, value } };
    });

    // --- Segunda pasada: el motor de promociones se apaga solo si la venta
    // TERMINÓ con algún descuento manual. Decidirlo por la intención sería un
    // error: si los dados dejaron todas las líneas sin descuento, la venta no
    // tiene ninguno y las promociones sí corren.
    const hayManual =
      this.ordenManual !== null || borrador.some((l) => l.manual !== undefined);

    return borrador.map((l): LineaSimulada => {
      if (l.manual) {
        const { kind, value } = l.manual;
        return {
          ...l,
          manual: l.manual,
          descuento: (bruto: number): number =>
            redondearPeso(Math.min(kind === 'PERCENT' ? (bruto * value) / 100 : value, bruto)),
        };
      }
      return {
        ...l,
        manual: undefined,
        esPromo: !hayManual,
        descuento: (bruto: number): number =>
          hayManual
            ? 0
            : descuentoDeLinea(this.m.promos, {
                productoId: l.producto.id,
                subtotal: bruto,
                cantidad: l.cantidad,
                esCombo: l.producto.isCombo,
              }),
      };
    });
  }

  /**
   * Tamaño y extras de una línea, con su efecto en el precio y en el consumo.
   *
   * Los dos suben el precio; además el tamaño puede traer receta propia
   * (aditiva) y el extra su `recipeDelta`. La cantidad del `recipeDelta` es
   * BRUTA —ya trae la merma incluida—, a diferencia de la receta del producto.
   */
  private elegirOpciones(producto: ProductoSombra): {
    precioUnitario: number;
    sizeId?: string;
    extras?: string[];
    consumoExtra: Map<string, number>;
  } {
    const consumoExtra = new Map<string, number>();
    if (producto.id !== this.m.conOpciones.producto.id) {
      return { precioUnitario: producto.precio, consumoExtra };
    }

    const { tamanos, extras } = this.m.conOpciones;
    const tamano = this.rng.pick(tamanos);
    const elegidos = extras.filter(() => this.rng.chance(0.4));

    let precioUnitario = producto.precio + tamano.priceModifier;
    for (const arista of tamano.receta) {
      const clave = claveDe(
        arista.childType === 'ingredient' ? 'INGREDIENT' : 'SUBPRODUCT',
        arista.childId,
      );
      consumoExtra.set(clave, (consumoExtra.get(clave) ?? 0) + cantidadBruta(arista));
    }
    for (const extra of elegidos) {
      precioUnitario += extra.priceDelta;
      for (const arista of extra.consumo) {
        const clave = claveDe(
          arista.childType === 'ingredient' ? 'INGREDIENT' : 'SUBPRODUCT',
          arista.childId,
        );
        consumoExtra.set(clave, (consumoExtra.get(clave) ?? 0) + arista.quantityNeta);
      }
    }
    return {
      precioUnitario,
      sizeId: tamano.id,
      extras: elegidos.map((e) => e.id),
      consumoExtra,
    };
  }

  /** Pago simple o cuenta dividida en partes que suman exacto. */
  private armarPago(total: number): {
    body: Record<string, unknown>;
    metodos: Array<{ method: string; amount: number }>;
  } {
    const dividir = this.rng.chance(0.3) && total >= 200;
    if (!dividir) {
      const method = this.rng.chance(0.65) ? 'CASH' : 'TRANSFER';
      if (method === 'CASH') {
        return {
          body: { method, amountReceived: total + this.rng.pick([0, 1000, 5000]) },
          metodos: [{ method, amount: total }],
        };
      }
      return {
        body: { method, amountReceived: total, digitalDoubleVerified: true },
        metodos: [{ method, amount: total }],
      };
    }

    const partes = this.rng.int(2, 3);
    // Reparto en centavos exactos: el remanente va a la primera parte, así la
    // suma cierra sin depender del redondeo.
    const centavos = Math.round(total * 100);
    const base = Math.floor(centavos / partes);
    const montos = Array.from({ length: partes }, (_, i) =>
      i === 0 ? base + (centavos - base * partes) : base,
    ).map((c) => c / 100);

    const metodos = montos.map((amount) => ({
      method: this.rng.chance(0.6) ? 'CASH' : 'TRANSFER',
      amount,
    }));
    return {
      body: {
        payments: metodos.map((p) =>
          p.method === 'CASH'
            ? { method: p.method, amount: p.amount, amountReceived: p.amount }
            : { method: p.method, amount: p.amount, digitalVerified: true },
        ),
      },
      metodos,
    };
  }



  // ==================================================================
  // Pedido WEB (el cliente lo hace solo, desde la página)
  // ==================================================================

  /**
   * Pedido hecho por el CLIENTE en la web pública, no por el cajero.
   *
   * Es un camino distinto al del mostrador y por eso se prueba aparte: entra
   * por `POST /web/orders` (sin sesión, con token firmado), nace
   * PENDIENTE_PAGO y no descuenta nada hasta que el cajero verifica el
   * comprobante. Recién ahí sale el stock y entra la plata.
   *
   * Después el pedido sigue su ciclo según cómo lo reciba el cliente:
   *   RECOGER   … → PAGADO → LISTO_DESPACHO            (listo = fin)
   *   DOMICILIO … → PAGADO → LISTO_DESPACHO → ENTREGADO (salió en la moto → llegó)
   */
  async pedidoWeb(opciones: { domicilio: boolean }): Promise<void> {
    const elegidos = this.rng.sample(
      this.m.productos.filter((p) => !p.isCombo),
      this.rng.int(1, 2),
    );
    const lineas = elegidos.map((producto) => ({
      producto,
      cantidad: this.rng.int(1, 2),
    }));

    const necesidad = new Map<string, number>();
    for (const l of lineas) {
      for (const [clave, qty] of consumoDeUnaUnidad(l.producto, this.m.catalogo)) {
        necesidad.set(clave, (necesidad.get(clave) ?? 0) + qty * l.cantidad);
      }
    }
    await this.garantizarStock(necesidad);

    // El precio lo pone el servidor desde el catálogo: el cliente solo manda
    // qué quiere y cuánto. Un pedido web que aceptara precios del navegador
    // sería un agujero, y por eso acá se calcula el total a mano y se compara.
    let subtotal = 0;
    let descuentoPromo = 0;
    for (const l of lineas) {
      const bruto = l.producto.precio * l.cantidad;
      subtotal += bruto;
      descuentoPromo += descuentoDeLinea(this.m.promos, {
        productoId: l.producto.id,
        subtotal: bruto,
        cantidad: l.cantidad,
        esCombo: l.producto.isCombo,
      });
    }
    const totalEsperado = redondearPeso(subtotal - descuentoPromo);

    const creado = await esperar(
      this.m.request
        .post('/web/orders')
        .set('Idempotency-Key', randomUUID())
        .send({
          type: opciones.domicilio ? 'WEB_DELIVERY' : 'WEB_PICKUP',
          items: lineas.map((l) => ({ productId: l.producto.id, quantity: l.cantidad })),
          customerName: 'Cliente Web',
          customerPhone: '+573001234567',
          ...(opciones.domicilio
            ? { deliveryAddress: 'Carrera 15 # 80-25, torre 3, apto 402' }
            : {}),
        }),
      201,
    );
    const saleId = creado.body.order.id as string;
    const token = creado.body.token as string;

    if (Math.abs(Number(creado.body.order.total) - totalEsperado) > 0.011) {
      throw new Error(
        `El total del pedido web no coincide con el calculado a mano: ` +
          `API=${creado.body.order.total} sombra=${totalEsperado} (pedido ${saleId})`,
      );
    }

    // El cliente consulta su pedido con el token firmado. Sin token no debería
    // poder verlo: es un pedido de otra persona.
    await esperar(this.m.request.get(`/web/orders/${saleId}?token=${encodeURIComponent(token)}`), 200);
    await esperar(this.m.request.get(`/web/orders/${saleId}?token=inventado`), 401);

    // Mientras no se cobre, el pedido no puede haber tocado el inventario.
    const movimientosAntes = await this.m.prisma.inventoryMovement.count({
      where: { sourceType: 'sale', sourceId: saleId },
    });
    if (movimientosAntes !== 0) {
      throw new Error(
        `El pedido web ${saleId} descontó stock ANTES de cobrarse (${movimientosAntes} movimientos).`,
      );
    }

    // --- El cajero cotiza el envío y verifica el comprobante ---
    const envio = opciones.domicilio ? this.rng.money(3000, 9000) : 0;
    if (envio > 0) {
      await esperar(
        this.m.request.patch(`/sales/${saleId}/delivery-fee`).set(this.m.auth()).send({ fee: envio }),
        200,
      );
    }
    const total = redondearPeso(totalEsperado + envio);
    const pago = this.armarPago(total);
    await esperar(
      this.m.request
        .post(`/sales/${saleId}/confirm-payment`)
        .set(this.m.auth())
        .send(pago.body),
      201,
    );

    // --- Consumo y costo FIFO sombra (recién ahora sale el stock) ---
    let costo = 0;
    const tomas = new Map<string, Lote[]>();
    for (const [clave, qty] of necesidad) {
      const r = this.cola(clave).salida(qty);
      costo += r.costo;
      tomas.set(clave, r.tomas);
      this.mover(clave, -qty);
    }

    const efectivoBruto = pago.metodos
      .filter((p) => p.method === 'CASH')
      .reduce((acc, p) => acc + p.amount, 0);
    const efectivoNeto = total > 0 ? efectivoBruto - (envio * efectivoBruto) / total : 0;

    let asignado = 0;
    const devolucionEnvioEfectivo = pago.metodos.reduce((acc, parte, i) => {
      const bruta =
        i === pago.metodos.length - 1
          ? redondearPeso(envio - asignado)
          : redondearPeso(total > 0 ? (parte.amount * envio) / total : 0);
      asignado = redondearPeso(asignado + bruta);
      return parte.method === 'CASH' ? acc + bruta : acc;
    }, 0);

    const venta: VentaRegistrada = {
      id: saleId,
      total,
      deliveryFee: envio,
      costo: redondearCosto(costo),
      tomas,
      efectivo: efectivoNeto,
      metodos: pago.metodos,
      descuento: descuentoPromo,
      lineas: lineas.map((l) => ({
        productoId: l.producto.id,
        cantidad: l.cantidad,
        precioUnitario: l.producto.precio,
        descuento: descuentoDeLinea(this.m.promos, {
          productoId: l.producto.id,
          subtotal: l.producto.precio * l.cantidad,
          cantidad: l.cantidad,
          esCombo: l.producto.isCombo,
        }),
      })),
      consumo: new Map(necesidad),
      // Un pedido web ya cobrado sigue su ciclo de despacho; editarlo mezclaría
      // dos cosas distintas y la edición ya se prueba sobre el mostrador.
      editable: false,
      devolucionEnvioEfectivo: envio > 0 ? devolucionEnvioEfectivo : 0,
      estado: 'PAGADO',
    };
    this.ventas.push(venta);
    this.ingreso += total - envio;
    this.descuentos += descuentoPromo;
    this.descuentoPromos += descuentoPromo;
    if (envio > 0) {
      this.envioCobrado += envio;
      this.envioPedidos += 1;
    }
    this.cogs += venta.costo;
    this.efectivoDeVentas += efectivoNeto;

    // --- Ciclo de entrega ---
    // Marcar listo es donde el cliente recibe el aviso. Para RECOGER ahí
    // termina; para DOMICILIO significa "salió en la moto" y falta cerrar con
    // ENTREGADO — sin ese paso el tiempo de reparto no se puede medir.
    await esperar(
      this.m.request.post(`/sales/${saleId}/mark-ready`).set(this.m.auth()).send({}),
      201,
    );
    venta.despachado = true;
    if (opciones.domicilio && this.rng.chance(0.7)) {
      await esperar(
        this.m.request.post(`/sales/${saleId}/mark-delivered`).set(this.m.auth()).send({}),
        201,
      );
      this.entregados.push(saleId);
    }
    this.pedidosWeb.push({ id: saleId, domicilio: opciones.domicilio });
    this.cuenta(opciones.domicilio ? 'web-domicilio' : 'web-recoger');
  }

  // ==================================================================
  // Edición de un pedido YA COBRADO (corrección del mostrador)
  // ==================================================================

  /**
   * Cambia las cantidades de un pedido cobrado. Es la operación con más
   * aritmética encadenada del sistema: recalcula precios y promociones, ajusta
   * el stock por la DIFERENCIA de consumo (no revierte y vuelve a descontar) y
   * reajusta el pago al nuevo total.
   */
  async editar(venta: VentaRegistrada): Promise<void> {
    const nuevasLineas = venta.lineas.map((l) => ({
      productoId: l.productoId,
      cantidad: Math.max(1, l.cantidad + this.rng.int(-1, 2)),
    }));
    if (nuevasLineas.every((l, i) => l.cantidad === venta.lineas[i]!.cantidad)) return;

    const nuevoConsumo = new Map<string, number>();
    let nuevoSubtotal = 0;
    let nuevoDescuento = 0;
    for (let i = 0; i < nuevasLineas.length; i += 1) {
      const l = nuevasLineas[i]!;
      const previa = venta.lineas[i]!;
      const producto = this.m.catalogo.get(l.productoId)!;
      for (const [clave, qty] of consumoDeUnaUnidad(producto, this.m.catalogo)) {
        nuevoConsumo.set(clave, (nuevoConsumo.get(clave) ?? 0) + qty * l.cantidad);
      }
      // Lo ya COBRADO no se re-precia (decisión 2026-08-25): la línea conserva
      // el precio con que se cobró y su descuento se escala POR UNIDAD. Sin
      // esa regla, agregarle una gaseosa a un pedido a las 20:05 le quitaba a
      // la hamburguesa la promoción con la que se cobró a las 19:58.
      const subtotalLinea = redondearPeso(previa.precioUnitario * l.cantidad);
      const porUnidad = previa.cantidad > 0 ? previa.descuento / previa.cantidad : 0;
      nuevoSubtotal += subtotalLinea;
      nuevoDescuento += Math.min(redondearPeso(porUnidad * l.cantidad), subtotalLinea);
    }

    // Reponer solo lo que la diferencia va a consumir de más.
    const extra = new Map<string, number>();
    for (const [clave, qty] of nuevoConsumo) {
      const delta = qty - (venta.consumo.get(clave) ?? 0);
      if (delta > 0) extra.set(clave, delta);
    }
    await this.garantizarStock(extra);

    const respuesta = await esperar(
      this.m.request
        .patch(`/sales/${venta.id}/items`)
        .set(this.m.auth())
        .send({
          items: nuevasLineas.map((l) => ({ productId: l.productoId, quantity: l.cantidad })),
        }),
      200,
    );

    // --- Stock: se aplica la DIFERENCIA, no un revertir-y-descontar ---
    let deltaCosto = 0;
    for (const clave of new Set([...nuevoConsumo.keys(), ...venta.consumo.keys()])) {
      const delta = (nuevoConsumo.get(clave) ?? 0) - (venta.consumo.get(clave) ?? 0);
      if (Math.abs(delta) < 1e-9) continue;
      if (delta > 0) {
        const r = this.cola(clave).salida(delta);
        deltaCosto += r.costo;
        venta.tomas.set(clave, [...(venta.tomas.get(clave) ?? []), ...r.tomas]);
        this.mover(clave, -delta);
      } else {
        // Devolver a la cabeza los últimos lotes que ESTA venta se llevó, con
        // su costo original (el ledger devuelve en orden inverso al consumo).
        const previas = [...(venta.tomas.get(clave) ?? [])];
        let porDevolver = -delta;
        const devueltas: Lote[] = [];
        while (porDevolver > 1e-9 && previas.length > 0) {
          const ultima = previas[previas.length - 1]!;
          const toma = Math.min(ultima.qty, porDevolver);
          devueltas.unshift({ qty: toma, unitCost: ultima.unitCost });
          deltaCosto -= toma * ultima.unitCost;
          ultima.qty -= toma;
          porDevolver -= toma;
          if (ultima.qty <= 1e-9) previas.pop();
        }
        this.cola(clave).devolver(devueltas);
        venta.tomas.set(clave, previas);
        this.mover(clave, -delta);
      }
    }

    const nuevoTotal = nuevoSubtotal - nuevoDescuento;
    if (Math.abs(Number(respuesta.body.total) - nuevoTotal) > 0.011) {
      // El total solo dice QUE no cuadra; para saber POR QUÉ hace falta ver
      // línea por línea cuál descuento aplicó cada lado.
      const detalle = (respuesta.body.items as Array<Record<string, unknown>>)
        .map(
          (i) =>
            `${String(i.productName ?? i.productId)} x${String(i.quantity)}: ` +
            `sub=${String(i.lineSubtotal)} desc=${String(i.lineDiscount)} ` +
            `promo=${String(i.appliedPromotionId ?? '-')}`,
        )
        .join(' | ');
      const sombra = nuevasLineas
        .map((l, i) => {
          const prod = this.m.catalogo.get(l.productoId)!;
          const previa = venta.lineas[i]!;
          const sub = redondearPeso(previa.precioUnitario * l.cantidad);
          const porUnidad = previa.cantidad > 0 ? previa.descuento / previa.cantidad : 0;
          const d = Math.min(redondearPeso(porUnidad * l.cantidad), sub);
          return `${prod.nombre} x${l.cantidad}: sub=${sub} desc=${d} (congelado de ${previa.precioUnitario})`;
        })
        .join(' | ');
      throw new Error(
        `El total tras editar no coincide con el calculado a mano: ` +
          `API=${respuesta.body.total} sombra=${nuevoTotal} (venta ${venta.id})\n` +
          `  API:    ${detalle}\n  sombra: ${sombra}`,
      );
    }

    this.ingreso += nuevoTotal - venta.total;
    this.descuentos += nuevoDescuento - venta.descuento;
    this.cogs += redondearCosto(deltaCosto);
    if (venta.metodos[0]!.method === 'CASH') {
      this.efectivoDeVentas += nuevoTotal - venta.total;
    }

    venta.total = nuevoTotal;
    venta.descuento = nuevoDescuento;
    venta.costo = redondearCosto(venta.costo + deltaCosto);
    venta.consumo = nuevoConsumo;
    venta.lineas = nuevasLineas.map((l, i) => {
      const previa = venta.lineas[i]!;
      const subtotalLinea = redondearPeso(previa.precioUnitario * l.cantidad);
      const porUnidad = previa.cantidad > 0 ? previa.descuento / previa.cantidad : 0;
      return {
        productoId: l.productoId,
        cantidad: l.cantidad,
        precioUnitario: previa.precioUnitario,
        descuento: Math.min(redondearPeso(porUnidad * l.cantidad), subtotalLinea),
      };
    });
    venta.metodos = [{ method: venta.metodos[0]!.method, amount: nuevoTotal }];
    venta.efectivo = venta.metodos[0]!.method === 'CASH' ? nuevoTotal : 0;
    this.editadas.add(venta.id);
    this.cuenta('edicion');
  }

  // ==================================================================
  // Anulación y reembolso
  // ==================================================================

  /** Anula una venta pagada: revierte stock, ingreso y costo. */
  async anular(venta: VentaRegistrada): Promise<void> {
    await esperar(
      this.m.request
      .post(`/sales/${venta.id}/void`)
      .set(this.m.auth())
      .set('X-Approval-Pin', PIN)
      .send({ reason: 'Simulación: anulación de prueba' }),
      201,
    );

    for (const [clave, tomas] of venta.tomas) {
      this.cola(clave).devolver(tomas);
      this.mover(clave, tomas.reduce((acc, t) => acc + t.qty, 0));
    }
    this.ingreso -= venta.total - venta.deliveryFee;
    if (venta.deliveryFee > 0) {
      this.envioCobrado -= venta.deliveryFee;
      this.envioPedidos -= 1;
    }
    this.cogs -= venta.costo;
    this.descuentos -= venta.descuento;
    this.efectivoDeVentas -= venta.efectivo;
    this.cajaSalidas += venta.devolucionEnvioEfectivo;
    venta.estado = 'VOID';
    this.cuenta('anulacion');
  }

  /**
   * Reembolsa una venta: la plata vuelve al cliente pero la comida ya se
   * consumió, así que el stock NO se devuelve y su costo pasa a ser pérdida.
   *
   * Solo tiene sentido sobre un pedido ya despachado: uno recién cobrado se
   * anula (y ahí sí vuelve el stock). Por eso el pedido pasa antes por
   * "marcar listo", que es el camino real del cajero.
   */
  async reembolsar(venta: VentaRegistrada): Promise<void> {
    // Reembolsar exige que el pedido ya se haya despachado (si no se despachó,
    // la corrección correcta es ANULAR, que sí devuelve el stock). Un pedido
    // web ya recorrió ese paso solo; uno de mostrador hay que empujarlo.
    if (!venta.despachado) {
      await esperar(
        this.m.request.post(`/sales/${venta.id}/mark-ready`).set(this.m.auth()).send({}),
        201,
      );
      venta.despachado = true;
    }
    await esperar(
      this.m.request
      .post(`/sales/${venta.id}/refund`)
      .set(this.m.auth())
      .set('X-Approval-Pin', PIN)
      .send({ reason: 'Simulación: reembolso de prueba' }),
      201,
    );

    this.ingreso -= venta.total - venta.deliveryFee;
    if (venta.deliveryFee > 0) {
      this.envioCobrado -= venta.deliveryFee;
      this.envioPedidos -= 1;
    }
    this.cogs -= venta.costo;
    this.costoReembolso += venta.costo;
    this.descuentos -= venta.descuento;
    this.efectivoDeVentas -= venta.efectivo;
    this.cajaSalidas += venta.devolucionEnvioEfectivo;
    venta.estado = 'REEMBOLSADO';
    this.cuenta('reembolso');
  }

  // ==================================================================
  // Pérdidas: merma y cortesía
  // ==================================================================

  async merma(): Promise<void> {
    const insumo = this.rng.pick(this.m.insumos);
    const clave = claveDe('INGREDIENT', insumo.id);
    const cantidad = this.rng.int(1, 30);
    await this.garantizarStock(new Map([[clave, cantidad]]));

    const res = await esperar(
      this.m.request
      .post('/inventory/movements')
      .set(this.m.auth())
      .send({
        entityType: 'INGREDIENT',
        ingredientId: insumo.id,
        delta: -cantidad,
        type: 'WASTE',
        notes: 'Simulación: merma de prueba',
      }),
      201,
    );

    const r = this.cola(clave).salida(cantidad);
    this.mover(clave, -cantidad);
    this.costoMerma += r.costo;
    this.mermas.push({
      movementId: res.body.id as string,
      clave,
      cantidad,
      costo: r.costo,
      tomas: r.tomas,
      devuelto: 0,
    });
    this.cuenta('merma');
  }

  /** Anula una merma entera: devuelve unidades y costo a su lote original. */
  async anularMerma(merma: MermaRegistrada): Promise<void> {
    await esperar(
      this.m.request
      .post(`/inventory/movements/${merma.movementId}/reverse-waste`)
      .set(this.m.auth())
      .send({ reason: 'Simulación: merma mal registrada' }),
      201,
    );

    this.cola(merma.clave).devolver(merma.tomas);
    this.mover(merma.clave, merma.cantidad);
    this.costoMerma -= merma.costo;
    merma.devuelto = merma.cantidad;
    this.cuenta('anulacion-merma');
  }

  async cortesia(): Promise<void> {
    const producto = this.rng.pick(this.m.productos.filter((p) => !p.isCombo));
    const cantidad = this.rng.int(1, 2);
    const necesidad = new Map<string, number>();
    for (const [clave, qty] of consumoDeUnaUnidad(producto, this.m.catalogo)) {
      necesidad.set(clave, qty * cantidad);
    }
    await this.garantizarStock(necesidad);

    const creada = await esperar(
      this.m.request
      .post('/cortesias')
      .set(this.m.auth())
      .set('Idempotency-Key', randomUUID())
      .send({ productId: producto.id, quantity: cantidad, reason: 'Simulación: cortesía' }),
      201,
    );

    let costo = 0;
    const tomas = new Map<string, Lote[]>();
    for (const [clave, qty] of necesidad) {
      const r = this.cola(clave).salida(qty);
      costo += r.costo;
      tomas.set(clave, r.tomas);
      this.mover(clave, -qty);
    }
    const costoTotal = redondearCosto(costo);
    this.costoCortesia += costoTotal;
    this.cortesias.push({
      id: creada.body.id as string,
      costo: costoTotal,
      tomas,
      revertida: false,
    });
    this.cuenta('cortesia');
  }


  // ==================================================================
  // Compra por FACTURA (el camino real, con flete del proveedor)
  // ==================================================================

  /**
   * Registra una factura confirmada. Es distinta de `entrada`: además de crear
   * el lote FIFO, la factura puede traer FLETE — lo que el proveedor cobró por
   * traer la mercancía. Ese flete NO se prorratea en los lotes (encarecería
   * insumos al azar y desviaría el margen por producto): se resta aparte en el
   * P&G, como la merma y las cortesías.
   */
  async comprarConFactura(): Promise<void> {
    const cuantos = this.rng.int(1, 3);
    const elegidos = this.rng.sample(this.m.insumos, cuantos);

    const items = elegidos.map((ins) => {
      // La factura viene en unidad de COMPRA (kg); el stock se lleva en gramos.
      const cantidadCompra = this.rng.int(1, 20);
      const precioUnidad = this.rng.int(3000, 60_000);
      return {
        entityType: 'INGREDIENT' as const,
        ingredientId: ins.id,
        descriptionRaw: `${ins.nombre} x${cantidadCompra} kg`,
        quantity: cantidadCompra,
        unit: 'kg',
        unitPrice: precioUnidad,
        total: cantidadCompra * precioUnidad,
      };
    });

    const sumaItems = items.reduce((acc, it) => acc + it.total, 0);
    const flete = this.rng.chance(0.4) ? this.rng.money(3000, 25_000) : 0;

    await esperar(
      this.m.request
        .post('/invoices/manual')
        .set(this.m.auth())
        .send({
          supplierNit: this.m.supplierNit,
          supplierName: 'Proveedor Simulación',
          invoiceNumber: `SIM-${this.conteo['factura'] ?? 0}-${this.rng.int(1000, 9999)}`,
          // El total de la factura es la suma de sus líneas MÁS el flete.
          total: sumaItems + flete,
          freight: flete,
          items,
        }),
      201,
    );

    for (const it of items) {
      // El insumo se configuró kg→g con factor 1000: la factura entra
      // `quantity × 1000` gramos y el costo del lote es total ÷ gramos, que es
      // lo que de verdad se pagó por unidad de stock.
      const gramos = it.quantity * 1000;
      const clave = claveDe('INGREDIENT', it.ingredientId);
      const costoUnitario = redondearCosto(it.total / gramos);
      this.cola(clave).entrada(gramos, costoUnitario);
      this.mover(clave, gramos);
      this.conInicial.add(clave);
      this.compras += redondearCosto(gramos * costoUnitario);
    }
    this.fletes += flete;
    if (flete > 0) this.facturasConFlete += 1;
    this.comprasFacturadas += sumaItems;
    this.cuenta('factura');
  }

  // ==================================================================
  // Factura ANULADA (se cargó mal y el dueño la deshace)
  // ==================================================================

  /**
   * Carga una factura y la anula enseguida.
   *
   * La contabilidad sombra NO registra NADA: ni el lote, ni la compra, ni el
   * flete. Esa ausencia ES la ley que se está probando — anular tiene que dejar
   * los libros como si la factura nunca se hubiera cargado. Si la app dejara
   * cualquier residuo (mercancía en el inventario, un peso en las compras, un
   * flete en el P&G), las leyes de la simulación lo delatan sin que haya que
   * escribir una aserción específica.
   */
  async comprarConFacturaYAnular(): Promise<void> {
    const insumo = this.rng.pick(this.m.insumos);
    const cantidadCompra = this.rng.int(1, 20);
    const precioUnidad = this.rng.int(3000, 60_000);
    const total = cantidadCompra * precioUnidad;
    const flete = this.rng.chance(0.4) ? this.rng.money(3000, 25_000) : 0;

    const creada = await esperar(
      this.m.request
        .post('/invoices/manual')
        .set(this.m.auth())
        .send({
          supplierNit: this.m.supplierNit,
          supplierName: 'Proveedor Simulación',
          invoiceNumber: `SIM-ANUL-${this.rng.int(1000, 9999)}`,
          total: total + flete,
          freight: flete,
          items: [
            {
              entityType: 'INGREDIENT' as const,
              ingredientId: insumo.id,
              descriptionRaw: `${insumo.nombre} x${cantidadCompra} kg`,
              quantity: cantidadCompra,
              unit: 'kg',
              unitPrice: precioUnidad,
              total,
            },
          ],
        }),
      201,
    );

    await esperar(
      this.m.request
        .post(`/invoices/${creada.body.id as string}/void`)
        .set(this.m.auth())
        .set('X-Approval-Pin', PIN)
        .send({ reason: 'Simulación: factura cargada por error' }),
      201,
    );

    this.cuenta('facturaAnulada');
  }

  // ==================================================================
  // Cortesía revertida (el admin la anuló por error)
  // ==================================================================

  async revertirCortesia(cort: CortesiaRegistrada): Promise<void> {
    await esperar(
      this.m.request
        .post(`/cortesias/${cort.id}/reverse`)
        .set(this.m.auth())
        .send({ note: 'Simulación: cortesía mal registrada' }),
      201,
    );
    for (const [clave, tomas] of cort.tomas) {
      this.cola(clave).devolver(tomas);
      this.mover(
        clave,
        tomas.reduce((acc, t) => acc + t.qty, 0),
      );
    }
    this.costoCortesia -= cort.costo;
    cort.revertida = true;
    this.cuenta('cortesia-revertida');
  }


  // ==================================================================
  // Conteo físico (arqueo del inventario)
  // ==================================================================

  /**
   * Cuenta físicamente un insumo y encuentra MENOS de lo que dice el sistema
   * (la merma silenciosa de todos los días: se cae, se sirve de más, se pierde).
   * El conteo de un admin se aprueba solo y ajusta el stock en el acto.
   *
   * Solo faltantes a propósito: una SOBRA entra al inventario sin costo propio
   * —nadie sabe qué pagó por algo que apareció— y el ledger la reporta como
   * cantidad desconocida, no como valor. Mezclarla acá haría que la ley del
   * costo exacto midiera otra cosa. Que lo desconocido NO se asuma en $0 es
   * justo lo que prueban las leyes de propiedad del ledger.
   */
  async conteoFisico(): Promise<void> {
    const insumo = this.rng.pick(this.m.insumos);
    const clave = claveDe('INGREDIENT', insumo.id);
    // Repone si hace falta en vez de salir sin hacer nada: una operación que a
    // veces no ocurre deja la ley que la mide pasando sin haber probado nada.
    await this.garantizarStock(new Map([[clave, 40]]));
    const enLibros = this.stock(clave);

    const faltante = Math.min(this.rng.int(1, 15), Math.floor(enLibros / 2));
    const contado = enLibros - faltante;

    await esperar(
      this.m.request
        .post('/inventory/counts')
        .set(this.m.auth())
        .send({
          entityType: 'INGREDIENT',
          ingredientId: insumo.id,
          countedQty: contado,
          notes: 'Simulación: conteo físico',
        }),
      201,
    );

    const r = this.cola(clave).salida(faltante);
    this.mover(clave, -faltante);
    this.faltantesPorConteo += r.costo;
    this.cuenta('conteo-fisico');
  }

  // ==================================================================
  // Caja
  // ==================================================================

  async movimientoCaja(): Promise<void> {
    const tipo = this.rng.pick(['IN', 'OUT'] as const);
    const monto = this.rng.money(2000, 40_000);
    await esperar(
      this.m.request
      .post(`/shifts/${this.m.shiftId}/cash-movements`)
      .set(this.m.auth())
      .send({ type: tipo, method: 'CASH', amount: monto, reason: 'Simulación de movimiento' }),
      201,
    );
    if (tipo === 'IN') this.cajaEntradas += monto;
    else this.cajaSalidas += monto;
    this.cuenta(`caja-${tipo}`);
  }

  /**
   * Efectivo que debería haber en el cajón según la sombra.
   *
   * Lo cobrado se redondea a pesos ENTEROS antes de sumarlo, igual que el
   * arqueo: en Colombia no circulan centavos y el cajero cuenta billetes, así
   * que pedirle que cuadre $0,49 no tendría sentido. El redondeo va sobre la
   * SUMA, no sobre cada pago — redondear pago por pago acumularía sesgo.
   */
  get efectivoEsperado(): number {
    return (
      Math.round(this.m.openingCash) +
      Math.round(this.efectivoDeVentas) +
      this.cajaEntradas -
      this.cajaSalidas
    );
  }

  /** Valor total del inventario según la sombra. */
  get valorInventario(): number {
    let total = 0;
    for (const cola of this.colas.values()) total += cola.valor;
    return redondearCosto(total);
  }
}

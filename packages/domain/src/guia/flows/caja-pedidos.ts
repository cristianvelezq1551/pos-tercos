import type { GuideFlow } from '../types';

export const FLOW_PEDIDO_WEB: GuideFlow = {
  id: 'atender-pedido-web',
  area: 'caja',
  title: 'Atender un pedido de la web',
  summary: 'Del comprobante del cliente al pedido entregado, avisándole en cada paso.',
  audience: ['caja'],
  icon: 'globe',
  when: 'Cada vez que entra un pedido por la página. El contador del botón "Web" te lo dice.',
  before: ['Turno abierto: al confirmar el pago, la venta entra a TU caja.'],
  steps: [
    {
      do: 'Mira el comprobante que mandó el cliente por WhatsApp y verifica monto y fecha.',
      why: 'Nadie más va a revisar esto. Confirmar sin mirar es regalar el pedido.',
    },
    { do: 'Caja → botón "Web" → pestaña Pend. pago. Abre el pedido.' },
    {
      do: 'Si es domicilio: escribe el costo del envío y toca "Cobrar por WhatsApp".',
      why: 'Se guarda el envío y se abre el chat con el total ya desglosado. Son una sola idea: el total no existía hasta que cotizaste el envío.',
    },
    { do: 'Toca "Confirmar pago", elige el medio por el que entró la plata y confirma.' },
    { do: 'Cuando esté listo: "Marcar listo para retirar" o "Marcar despachado" si va en moto.' },
    { do: 'Solo domicilios: al entregar, "Marcar entregado".' },
  ],
  sightings: [
    {
      where: 'Caja → Web → pestañas',
      what: 'Pend. pago · Por preparar · Listos / en camino · Entregados.',
      means: 'El pedido avanza de pestaña con cada botón que tocas. Si nadie los toca, se amontonan en "Por preparar" para siempre.',
    },
    {
      where: 'Caja → Historial',
      what: 'Al confirmar el pago aparece como una venta más del día.',
    },
    {
      where: 'Caja → Caja',
      what: 'Entra al arqueo del turno por el medio que elegiste.',
      means: 'Ojo: el cobro del envío NO entra al efectivo esperado. Al domiciliario se le paga al entregar, así que esa plata ya salió.',
    },
    {
      where: 'La página del cliente',
      what: 'Pasa a "Pago confirmado" y ahí se queda.',
      means:
        'La página no cuenta el avance a propósito: el resto se lo dices tú por WhatsApp. Una barra de progreso que nadie mueve es peor que no tenerla.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero → Domicilios del mes',
      what: 'Total, cantidad y promedio de los envíos.',
      means: 'El único lugar donde se muestra el envío. Sirve para decidir cuándo conviene un repartidor propio.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Los avisos los mandas tú, no el sistema',
      text:
        'Cada botón de WhatsApp abre el chat con el mensaje ya escrito; tú tocas enviar. Así el cliente te responde en el hilo de siempre en vez de escribirle a un número que nadie lee.',
    },
    {
      kind: 'warn',
      text:
        'Si un producto se agotó entre que el cliente pidió y tú confirmas, sale un aviso de faltante. Habla con el cliente ANTES de confirmar: cobrarle algo que no vas a poder entregar es peor que la llamada incómoda.',
    },
    {
      kind: 'note',
      text: 'Si el cliente nunca pagó, usa "Rechazar". El inventario no se toca porque nunca se descontó, y al cliente le llega el aviso de cancelación.',
    },
  ],
  questions: [
    {
      q: 'El cliente dice que pagó pero no veo el comprobante.',
      a: 'No confirmes. Escríbele por WhatsApp desde el mismo pedido y pídeselo. Confirmar es lo que descuenta inventario y manda el pedido a cocina.',
    },
    {
      q: 'Cambié el costo del envío después de avisarle.',
      a: 'El botón pasa a "Cambiar y reenviar" y manda el total corregido. El cliente tiene un número viejo en la mano: hay que decírselo.',
    },
    {
      q: '¿Por qué mis domicilios nunca llegan a "Entregados"?',
      a: 'Porque nadie toca "Marcar entregado". El cliente no se entera, pero pierdes el dato de cuánto tarda el reparto — y esos pedidos se quedan en la pestaña de en camino para siempre.',
    },
  ],
  seeAlso: ['pedidos-web', 'reglas'],
};

export const FLOW_CUENTA_ABIERTA: GuideFlow = {
  id: 'cuenta-abierta',
  area: 'caja',
  title: 'Manejar una cuenta abierta',
  summary: 'Un cliente que sigue pidiendo y paga al final, sin perder el control de lo que lleva.',
  audience: ['caja'],
  icon: 'shopping-cart',
  when: 'Mesa larga, cliente conocido, alguien que va a seguir pidiendo. Se abre en el primer pedido, no después.',
  before: ['Turno abierto y el nombre del cliente: sin nombre no deja abrir cuenta.'],
  steps: [
    { do: 'Arma el primer pedido y escribe el nombre del cliente arriba del carrito.' },
    { do: 'Toca "Cuenta" en vez de "Cobrar". Sale la comanda y el carrito queda libre.' },
    { do: 'Para agregarle: búscala en el panel izquierdo y usa "Agregar".' },
    {
      do: 'Toca "A cocina" para mandar lo nuevo.',
      why: 'Solo se imprime lo que todavía no se envió. La segunda tanda sale rotulada ADICIÓN, para que la cocina no vuelva a preparar lo de antes.',
    },
    { do: 'Al final, "Cobrar" desde el mismo panel.' },
  ],
  sightings: [
    {
      where: 'Caja → Vender → panel izquierdo',
      what: 'Las cuentas abiertas con su nombre y un contador de lo pendiente de mandar a cocina.',
    },
    {
      where: 'Caja → Historial',
      what: 'Aparece como pendiente de pago hasta que la cobres.',
      means: 'No entra al arqueo mientras no se pague: una cuenta abierta no es plata todavía.',
    },
    {
      where: 'Caja → Cerrar turno',
      what: 'Si queda alguna sin cobrar, el cierre se bloquea y te obliga a resolverla.',
      means:
        'Tres salidas: cobrarla, traspasarla al turno siguiente (sigue abierta y se cobra después) o cancelarla. Antes de esta regla, esas cuentas quedaban colgando de una caja muerta y ensuciaban el reporte.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text:
        'Las cuentas abiertas no se cancelan solas. Los cobros a medio hacer que quedan abandonados sí: el sistema los limpia a la media hora.',
    },
    {
      kind: 'warn',
      text: 'Si cancelas una cuenta que ya mandó tandas a cocina, se imprime la comanda de anulación. La cocina tiene que enterarse.',
    },
  ],
  questions: [
    {
      q: 'El cliente se fue sin pagar.',
      a: 'Cancélala con el motivo real. Queda registrada como cancelada, no cobrada, y el dueño la ve en el historial. Es mejor que dejarla abierta fingiendo que va a volver.',
    },
    {
      q: 'Se acabó mi turno y el cliente sigue comiendo.',
      a: 'Al cerrar, elige "Traspasar". La cuenta sale del arqueo de tu caja, sigue abierta y se cobra en la caja de quien esté cuando pague.',
    },
  ],
  seeAlso: ['caja-vender'],
};

export const FLOW_CORTESIA: GuideFlow = {
  id: 'dar-cortesia',
  area: 'caja',
  title: 'Dar una cortesía',
  summary: 'Regalar un producto dejando constancia de qué costó y por qué.',
  audience: ['caja', 'dueno'],
  icon: 'gift',
  when: 'Un cliente molesto, un error del local, una atención. En el momento de entregarlo.',
  before: ['Turno abierto.'],
  steps: [
    { do: 'Desde la caja, registra la cortesía indicando qué se regaló.' },
    {
      do: 'Escribe el motivo.',
      why: 'Es lo único que separa una atención comercial de un producto que salió sin explicación. El dueño recibe el aviso con tu nombre y el costo.',
    },
    {
      do: 'Confirma. Es inmediata, no espera aprobación.',
      why: 'El producto ya se entregó: pedir permiso después no cambia nada. El control es que queda escrito y con nombre.',
    },
  ],
  sightings: [
    {
      where: 'Caja → Historial',
      what: 'Mezclada con las ventas del día, en orden de hora, rotulada CORTESÍA con el valor tachado.',
      means: 'Tachado porque es pérdida, no un pedido más que entró plata. La cocina la preparó igual.',
    },
    {
      where: 'Gestión → Operación → Solicitudes',
      what: 'Todas las cortesías del mes con quién la dio, el motivo y su costo.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'La línea "− Cortesías (producto regalado, a costo)".',
      means:
        'Vale el costo real de los insumos que se fueron. Si dice "aprox.", falta la factura de algún insumo y se estimó con el último precio conocido.',
    },
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'El descuento de los insumos, igual que en una venta.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Lo regalado nunca cuesta cero',
      text:
        'La cortesía descuenta inventario y se valora a costo real. Asumirla en cero escondería la pérdida y haría ver el mes mejor de lo que fue.',
    },
    {
      kind: 'note',
      text: 'Si se registró mal, el dueño puede anularla desde Solicitudes: eso devuelve el inventario con su costo original.',
    },
  ],
  questions: [
    {
      q: '¿Cortesía o descuento del 100%?',
      a: 'Cortesía. Un descuento total deja una venta de $0 que ensucia el ticket promedio; la cortesía va a su propia línea de pérdida, que es lo que realmente fue.',
    },
    {
      q: 'Regalé solo un acompañamiento, no el plato.',
      a: 'Registra la cortesía de ese producto. Se valora por lo que costó, así que un acompañamiento pesa lo que pesa y no más.',
    },
  ],
  seeAlso: ['caja-vender', 'finanzas'],
};

export const FLOW_AGOTADO: GuideFlow = {
  id: 'marcar-agotado',
  area: 'caja',
  title: 'Marcar algo agotado (o forzar que se venda)',
  summary: 'Sacar un producto de la venta cuando se acabó, o dejarlo vender aunque el sistema diga que no hay.',
  audience: ['caja', 'dueno'],
  icon: 'shopping-basket',
  when:
    'Se acabó algo que el sistema no sabe que se acabó (se cayó la bandeja), o al revés: hay producto en la nevera pero el sistema lo bloquea.',
  before: ['Turno abierto.'],
  steps: [
    { do: 'Caja → Vender. Mantén el toque sobre el producto para abrir sus opciones.' },
    { do: 'Marca "Agotado" con el motivo, o "Forzar disponible" si sí hay.' },
  ],
  sightings: [
    {
      where: 'Caja → Vender',
      what: 'El producto queda con el cartel Agotado y no se puede agregar.',
    },
    {
      where: 'La página del cliente',
      what: 'También sale agotado: deja de poder pedirse por la web.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Stock forzado',
      what: 'Cada vez que alguien fuerza la venta de algo sin stock, con su nombre y motivo.',
      means:
        'Forzar es legítimo cuando el sistema está desactualizado, pero deja el inventario en negativo. Por eso queda registrado: es una deuda que alguien tiene que saldar con una factura o un conteo.',
    },
    {
      where: 'Gestión → Inventario → Deudas',
      what: 'Los insumos que quedaron en negativo por las ventas forzadas.',
    },
  ],
  pitfalls: [
    {
      kind: 'warn',
      text:
        'Forzar la venta repetidamente sin cargar las compras deja el inventario cada vez más torcido, y con él los costos y el margen. Es una solución para el momento, no una forma de trabajar.',
    },
    {
      kind: 'note',
      text:
        'Si un preparado sale agotado y tú sabes que hay, casi siempre falta registrar la producción del subproducto. Revisa eso antes de forzar: es la causa real y se arregla en un toque.',
    },
  ],
  questions: [
    {
      q: 'Un producto sale agotado y yo tengo todo en la nevera.',
      a: 'Falta registrar la tanda del subproducto. Que la cocina entre a Cocina → Producción y la registre: se desbloquea al instante y el inventario queda bien. Forzar lo vende, pero deja la deuda.',
    },
    {
      q: 'Marqué agotado y ya llegó más.',
      a: 'Vuelve a las opciones del producto y quita el agotado. Es manual en los dos sentidos.',
    },
  ],
  seeAlso: ['caja-vender', 'inventario'],
};

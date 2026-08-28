import type { GuideFlow } from '../types';

export const FLOW_COBRAR: GuideFlow = {
  id: 'vender-y-cobrar',
  title: 'Vender y cobrar un pedido',
  summary: 'Armar el pedido, cobrarlo de cualquier forma y que salga la comanda y la factura.',
  audience: ['caja'],
  icon: 'shopping-cart',
  when: 'Cada pedido del mostrador. Es el flujo que más veces se repite en el día.',
  before: ['Turno abierto. Sin turno la caja te manda a abrirlo.'],
  steps: [
    { do: 'Caja → Vender. Toca los productos del catálogo; si tienen variantes o extras, se abre una ventana para elegirlos.' },
    { do: 'Ajusta cantidades en el carrito de la derecha. Escribe el nombre del cliente si te lo pidieron.' },
    { do: 'Toca Cobrar.' },
    {
      do: 'Elige el método. En efectivo escribe cuánto te dio el cliente y el vuelto sale solo.',
      why: 'En transferencia hay que marcar la casilla de comprobante verificado. Es la única barrera contra cobrar un pedido que nunca se pagó.',
    },
    {
      do: 'Confirma. Se crea la venta, se descuenta el inventario, sale la comanda a cocina y se imprime la factura.',
      why: 'La venta se crea al CONFIRMAR, no al abrir la ventana. Si cierras sin pagar, no queda nada registrado.',
    },
  ],
  sightings: [
    {
      where: 'Caja → Historial',
      what: 'El pedido con su número, hora, método y total.',
    },
    {
      where: 'Caja → Caja',
      what: 'El badge "En caja" sube si fue efectivo.',
      means: 'Ese número es lo que deberías tener en el cajón ahora mismo. Sirve para arquear a mitad de turno sin cerrar.',
    },
    {
      where: 'Cocina',
      what: 'La comanda impresa. La cocina no tiene pantalla de pedidos: el papel ES el pedido.',
      means: 'Si la comanda no logra imprimirse sale un aviso rojo que no se va solo. La plata ya entró pero la cocina no vio el pedido: no lo ignores.',
    },
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'Un renglón "Venta" negativo por cada insumo consumido.',
      means: 'Un plato preparado descuenta un solo nivel: sus subproductos directos y sus insumos directos. Lo que hay dentro de un subproducto ya se descontó al producirlo.',
    },
    {
      where: 'Gestión → Reportes → Ventas',
      what: 'Suma a los ingresos del día, por fecha de PAGO.',
      means: 'Un pedido creado un día y pagado al siguiente cuenta en el día del pago. Por eso el reporte diario puede no coincidir con el Z de un turno que cruzó medianoche.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Descuento manual y promoción no conviven',
      text:
        'Apenas pones un descuento a mano, las promociones se apagan para TODO el pedido. Es a propósito: si se sumaran, nadie podría explicar de dónde salió el precio final. Si la promoción es mejor, quita el descuento.',
    },
    {
      kind: 'note',
      text:
        'Sin internet la caja sigue vendiendo: guarda todo y sincroniza al volver. Se cobra solo en efectivo o transferencia, con un método por venta, y los descuentos manuales y la cuenta dividida se ocultan porque no viajan en el envío offline.',
    },
  ],
  questions: [
    {
      q: 'El cliente quiere pagar entre varios.',
      a: 'En la ventana de cobro, "Dividir cuenta": partes iguales, por productos (cada quien lo suyo) o montos libres. Cada parte con su método. El botón se habilita cuando todas están cobradas y suman exacto. No existe "medio pagado": se confirma todo de un golpe o nada.',
    },
    {
      q: 'Cobré efectivo y era transferencia.',
      a: 'Caja → Historial → botón "Pago" en ese pedido. Corrige el método sin tocar los productos. Solo funciona con la caja abierta: una caja cerrada es inmutable.',
    },
    {
      q: 'El cliente se arrepintió después de pagar.',
      a: 'Depende de si la cocina empezó. Si no empezó: Anular — devuelve el inventario y desaparece del resultado. Si ya se preparó: Reembolsar — el inventario NO se devuelve porque los insumos se gastaron de verdad, y queda como pérdida a costo. Las dos piden motivo y PIN.',
    },
    {
      q: 'Un cliente conocido va a seguir pidiendo y paga al final.',
      a: 'Escribe su nombre y usa "Cuenta" en vez de "Cobrar". La comanda sale a cocina y el carrito queda libre. Le agregas más desde el panel izquierdo; cada "A cocina" imprime solo lo nuevo, rotulado como ADICIÓN.',
    },
  ],
  seeAlso: ['caja-vender', 'caja-cierre'],
};

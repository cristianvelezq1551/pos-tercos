import type { GuideFlow } from '../types';

export const FLOW_INSUMO: GuideFlow = {
  id: 'crear-insumo',
  area: 'catalogo',
  title: 'Cargar un insumo',
  summary: 'Dar de alta algo que compras y no vendes tal cual, con la conversión que hace posible costear.',
  audience: ['dueno'],
  icon: 'package',
  when: 'Al montar el catálogo y cada vez que entra un ingrediente nuevo. Antes de poder usarlo en una receta o en una factura.',
  before: [],
  steps: [
    { do: 'Gestión → Catálogo → Insumos → Nuevo.' },
    { do: 'Nombre.' },
    { do: 'Unidad de compra: como se lo compras al proveedor (bulto, caja, litro).' },
    { do: 'Unidad de receta: como lo consume la cocina (gramos, mililitros, unidad).' },
    {
      do: 'Factor de conversión: cuántas unidades de receta trae una de compra.',
      why:
        'Un bulto de sal de 1.000 g lleva factor 1000. Sin ese número el sistema no puede saber cuánto cuesta el gramo de sal que se fue en una hamburguesa, y el costo del plato queda mal para siempre.',
    },
    { do: 'Mínimo de alerta, en unidad de receta: por debajo de cuánto quieres que te avise.' },
    {
      do: 'Tamaño de porción, si aplica.',
      why: 'Hace que el inventario muestre "quedan 12 porciones" en vez de "quedan 1.800 g". Para la cocina, esa es la pregunta real.',
    },
    {
      do: 'Decide si frena la venta. Viene marcado.',
      why:
        'Desmárcalo para consumibles como servilletas o sal: se siguen descontando y costeando, pero no bloquean la venta ni aparecen como deuda. Quedarte sin servilletas no debería impedirte vender hamburguesas.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Catálogo → Insumos',
      what: 'El insumo con su costo, que empieza vacío.',
      means: 'El costo NO se escribe: se llena solo al confirmar la primera factura de compra que lo incluya.',
    },
    {
      where: 'Gestión → Inventario → Existencias',
      what: 'Aparece en cero hasta que entre por una factura o un ajuste inicial.',
    },
    {
      where: 'Gestión → Compras → Sugerencias inteligentes',
      what: 'Si baja del mínimo, el sistema propone solo cuánto pedir.',
      means: 'Por eso vale la pena poner un mínimo realista: es lo que dispara la sugerencia.',
    },
    {
      where: 'Cocina → Inventario',
      what: 'El cocinero lo ve con cantidades, nunca con costos.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Una gaseosa no es un insumo',
      text:
        'Lo que compras y revendes sin transformar va como PRODUCTO de reventa: tiene precio de venta y a la vez inventario y costo. Cargarlo como insumo lo saca de la carta.',
    },
    {
      kind: 'warn',
      text:
        'El factor de conversión mal puesto es el error más caro del catálogo: multiplica o divide el costo de todo lo que use ese insumo, y no salta a la vista hasta que el margen no cuadra.',
    },
  ],
  questions: [
    {
      q: 'Compro el pollo por kilos y lo receto en gramos.',
      a: 'Unidad de compra "kg", unidad de receta "g", factor 1000. Así una factura de 10 kg suma 10.000 g al inventario y una receta de 150 g descuenta lo que corresponde.',
    },
    {
      q: '¿Qué pongo si compro y receto en la misma unidad?',
      a: 'Factor 1. Es perfectamente válido: significa que no hay conversión.',
    },
    {
      q: 'Las servilletas me aparecen siempre en negativo.',
      a: 'Desmárcale "Frena la venta si no hay stock". Es un consumible: se sigue descontando y costeando, pero deja de bloquear ventas y de figurar como deuda que pide acción.',
    },
  ],
  seeAlso: ['catalogo', 'compras'],
};

export const FLOW_SUBPRODUCTO: GuideFlow = {
  id: 'crear-subproducto',
  area: 'catalogo',
  title: 'Crear un subproducto y su receta',
  summary: 'Dar de alta algo que se prepara aparte y entra en varios platos, con su propio inventario.',
  audience: ['dueno'],
  icon: 'layers',
  when:
    'Cuando una preparación se usa en más de un plato o se hace por tandas: pollo sazonado, salsa, masa. Si solo entra en un plato y se hace al momento, va directo en la receta de ese plato.',
  before: ['Sus insumos tienen que existir.'],
  steps: [
    { do: 'Gestión → Catálogo → Subproductos → Nuevo.' },
    { do: 'Nombre y unidad: cómo cuentas cada porción.' },
    {
      do: 'Rendimiento: cuántas porciones salen de una preparación completa de la receta.',
      why:
        'Si una olla de salsa rinde 7 porciones, pones 7. Con eso el sistema sabe que producir 14 consume dos recetas completas de insumos. Es el número que convierte "una olla" en unidades contables.',
    },
    { do: 'Mínimo de producción: por debajo de cuánto aparece como "Falta producir" en la cocina.' },
    { do: 'Guarda y entra a su Receta: agrega cada insumo con su cantidad neta y su merma.' },
  ],
  sightings: [
    {
      where: 'Cocina → Producción',
      what: 'Aparece en la lista de lo que se puede producir, con su stock y su mínimo.',
      means: 'Si está bajo el mínimo sale "Falta producir": eso es la orden de trabajo del cocinero.',
    },
    {
      where: 'Caja → Vender',
      what: 'Los productos que lo llevan salen AGOTADO hasta que se registre la primera tanda.',
      means: 'Es lo esperado el día que lo creas. No es un error: el sistema no puede suponer que hay algo que nunca se registró.',
    },
    {
      where: 'Gestión → Reportes → Costos y margen real',
      what: 'Su costo sale de los insumos de cada tanda dividido entre lo que rindió.',
      means: 'Por eso una tanda con poco rendimiento encarece todos los platos que lo llevan.',
    },
    {
      where: 'Cocina → Biblia',
      what: 'Su ficha con composición y paso a paso.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text:
        'Un subproducto puede llevar otro en su receta. Producir el de arriba consume del stock del de abajo, no de sus insumos: cada uno se produce por separado y en orden.',
    },
    {
      kind: 'warn',
      text:
        'El día que creas subproductos, todo lo que dependa de ellos sale agotado hasta la primera producción. Si vas a montar el catálogo, deja tiempo para que la cocina registre las tandas antes de abrir.',
    },
  ],
  questions: [
    {
      q: '¿Cuándo algo es subproducto y cuándo va directo en la receta del plato?',
      a: 'Si se prepara por tandas o lo usan varios platos, subproducto: así se controla su stock y su costo por lote. Si se hace al momento y solo para ese plato, va directo en la receta.',
    },
    {
      q: 'Mi olla rinde distinto cada vez.',
      a: 'Pon el rendimiento típico. En cada producción el cocinero escribe lo que salió de verdad, y la diferencia queda visible: si siempre rinde menos de lo cargado, el número está mal y hay que corregirlo.',
    },
  ],
  seeAlso: ['catalogo', 'cocina'],
};

export const FLOW_PROMOCION: GuideFlow = {
  id: 'crear-promocion',
  area: 'catalogo',
  title: 'Crear una promoción',
  summary: 'Un descuento automático con días, horas y canal, sin que nadie tenga que acordarse.',
  audience: ['dueno'],
  icon: 'tag',
  when: 'Antes de que empiece. Se programa con sus fechas y se activa sola.',
  before: ['Los productos que va a cubrir tienen que existir.'],
  steps: [
    { do: 'Gestión → Catálogo → Promociones → Nueva.' },
    {
      do: 'Elige el tipo: Descuento %, Descuento $, Lleva X paga Y, o Combo.',
      why: 'Los campos propios del tipo NO se pueden cambiar después. Para cambiarlos se desactiva y se crea otra, así el histórico de lo vendido sigue siendo cierto.',
    },
    { do: 'Marca los días de la semana y la franja horaria.' },
    { do: 'Define desde y hasta cuándo vive.' },
    {
      do: 'Elige dónde aplica: caja, web o ambas.',
      why: 'Una promo de web sirve para empujar el canal propio sin regalarle margen a quien ya está en el mostrador.',
    },
    { do: 'Selecciona los productos y guarda.' },
  ],
  sightings: [
    {
      where: 'Caja → Vender',
      what: 'El precio aparece tachado y el carrito muestra el descuento aplicado.',
      means: 'El cajero no hace nada: si la promo está vigente en ese día y hora, se aplica sola.',
    },
    {
      where: 'La página del cliente',
      what: 'Badge en el producto y precio tachado, si el canal la incluye.',
    },
    {
      where: 'Gestión → Reportes → Ventas',
      what: 'La línea "− Descuentos y promociones" separada de los ingresos.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'Ventas a precio de lista, menos descuentos, igual ingresos reales.',
      means: 'Ahí se ve cuánto costó la promoción de verdad, que es la pregunta que importa cuando decides si repetirla.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Las promociones no se suman',
      text:
        'Si dos aplican al mismo producto, gana la que le deje MÁS pesos de descuento al cliente. Nunca se acumulan. Y si el cajero pone un descuento a mano, las promociones se apagan para todo ese pedido.',
    },
    {
      kind: 'note',
      text: 'Desactivar una promo no borra su historial: lo vendido con ella sigue contando como se cobró.',
    },
  ],
  questions: [
    {
      q: 'Quiero 2x1 los martes de 3 a 6.',
      a: 'Tipo "Lleva X paga Y" con 2 y 1, marca solo el martes y la franja de 15:00 a 18:00. El sistema cuenta los juegos completos según la cantidad que lleve el cliente.',
    },
    {
      q: 'La promo no se está aplicando.',
      a: 'Revisa en orden: que esté activa, que hoy sea uno de los días marcados, que la hora esté dentro de la franja, que la fecha de fin no haya pasado, que el canal incluya la caja, y que el producto esté en la lista.',
    },
  ],
  seeAlso: ['catalogo'],
};

import type { GuideFlow } from '../types';

export const FLOW_CREAR_PRODUCTO: GuideFlow = {
  id: 'crear-producto',
  area: 'catalogo',
  title: 'Crear un producto',
  summary: 'Dar de alta algo que el cliente compra, con su receta, su costo real y su margen.',
  audience: ['dueno'],
  icon: 'shopping-basket',
  when:
    'Al montar el catálogo y cada vez que entra un plato nuevo a la carta. También cuando cambia la receta de uno existente: ahí se edita, no se crea otro.',
  before: [
    'La categoría tiene que existir (Gestión → Catálogo → Categorías). Sin categoría no se puede crear.',
    'Si es un preparado, sus insumos y subproductos tienen que estar cargados primero: la receta se arma con lo que ya existe.',
  ],
  steps: [
    { do: 'Gestión → Catálogo → Productos → Nuevo producto.' },
    {
      do: 'Elige el TIPO. El formulario cambia entero según lo que elijas.',
      why: 'Preparado simple (un precio, se hace con receta) · Con variantes (la elección cambia el precio) · Bebida o reventa (se compra hecho y se revende) · Combo (varios productos juntos a precio especial).',
    },
    { do: 'Nombre, categoría y precio de venta.' },
    {
      do: 'Si es de reventa, carga además unidad de compra, unidad de venta y factor de conversión.',
      why: 'Una caja de 24 gaseosas: unidad de compra "caja", unidad de venta "unidad", factor 24. Con eso el sistema sabe que vender una gaseosa descuenta 1/24 de caja.',
    },
    { do: 'Guarda. El producto ya existe, pero todavía no sabe cuánto cuesta.' },
    {
      do: 'Entra a su Receta y agrega cada insumo y subproducto que lleva, con la cantidad NETA (la que termina en el plato).',
      why: 'Neta significa lo que el cliente se come. Lo que se pierde al preparar va en el campo de merma, no acá.',
    },
    {
      do: 'Pon el porcentaje de merma de cada línea si se pierde parte al prepararla.',
      why:
        'Si de 1 kg de pollo crudo sirves 800 g, la merma es 20%. El sistema descuenta el kilo entero del inventario, porque el kilo entero es lo que sale de la nevera. Sin ese porcentaje, el inventario te va a cuadrar mal todos los días y no vas a saber por qué.',
    },
    {
      do: 'Guarda y mira el panel de costo: te dice cuánto cuesta el plato y qué margen deja al precio que pusiste.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Catálogo → Productos',
      what: 'El producto en la lista, con su costo calculado y su margen.',
      means:
        'El costo NO se escribe: sale de la receta y de las facturas de compra. Si aparece en cero o muy bajo, es que sus insumos todavía no tienen precio porque no se ha confirmado ninguna factura que los incluya.',
    },
    {
      where: 'Caja → Vender',
      what: 'El producto aparece en su categoría, listo para vender.',
      means:
        'Si sale "Agotado" apenas creado, es normal: sus subproductos están en cero hasta que la cocina registre la primera tanda. No es un error del producto.',
    },
    {
      where: 'La web del cliente (tercos.co)',
      what: 'Aparece en el menú público dentro de su categoría.',
      means: 'Solo si está activo y su categoría está activa. Desactivar una categoría esconde TODOS sus productos de golpe.',
    },
    {
      where: 'Gestión → Reportes → Productos',
      what: 'Cuánto se vendió, cuánto ingresó y qué margen dejó.',
      means:
        'Este margen usa la receta VIGENTE. Si cambiaste la receta el mes pasado, las ventas viejas se recalculan con la nueva. Para el número exacto por lote, mira Costos y margen real.',
    },
    {
      where: 'Cocina → Biblia',
      what: 'La ficha con su composición y el paso a paso de preparación.',
      means: 'La composición sale sola de la receta. El paso a paso lo escribes tú en el producto; si está vacío, la cocina ve la composición pero no el método.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'El precio de venta y el costo son dos números distintos',
      text:
        'El precio lo decides tú. El costo lo calcula el sistema desde la receta y las facturas, y se actualiza solo cada vez que confirmas una compra. Nunca escribas el costo a mano ni uses el precio de venta como costo: perderías el margen real, que es el único número que dice si el plato deja algo.',
    },
    {
      kind: 'warn',
      text:
        'La merma de la receta es lo que más se olvida y lo que más descuadra el inventario. Un producto sin merma cargada descuenta menos de lo que sale de la nevera, y todos los días te vas a quedar corto sin explicación.',
    },
    {
      kind: 'note',
      text:
        'Una bebida que compras y revendes NO se carga como insumo: se carga como producto de reventa. Tiene precio de venta y a la vez inventario y costo de compra.',
    },
  ],
  questions: [
    {
      q: 'Creé la hamburguesa y me dice que cuesta $0.',
      a: 'Le falta receta, o sus insumos no tienen precio todavía. El costo de un insumo se llena solo al confirmar una factura de compra que lo incluya. Sube esa factura y el costo aparece.',
    },
    {
      q: '¿Cómo cargo una hamburguesa que puede ser de carne o de pollo?',
      a: 'Como producto "Con variantes": una sola ficha con las dos opciones y su diferencia de precio. Así el reporte te muestra la hamburguesa como un solo producto y no como dos que compiten entre sí.',
    },
    {
      q: 'Cambié la receta. ¿Se dañan los reportes viejos?',
      a: 'El reporte de Productos recalcula el margen con la receta nueva, así que las ventas viejas cambian de margen. El de Costos y margen real no: ese sigue lote por lote con lo que costó de verdad. Si el cambio es grande, mira ese.',
    },
    {
      q: '¿Qué pongo en merma si no la he medido?',
      a: 'Empieza en 0 y ajústala cuando el inventario te muestre el desfase. Es preferible a inventar un número alto: una merma inflada esconde robo y desperdicio detrás de un porcentaje "normal".',
    },
    {
      q: 'Quiero dejar de vender un producto. ¿Lo borro?',
      a: 'Desactívalo, no lo borres. Desaparece de la caja y de la web, pero su historial de ventas sigue en pie. Borrarlo dejaría huecos en los reportes de meses ya cerrados.',
    },
  ],
  seeAlso: ['catalogo', 'compras', 'reportes'],
};

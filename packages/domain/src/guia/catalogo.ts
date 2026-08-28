import type { GuideChapter } from './types';

export const CATALOGO: GuideChapter = {
  id: 'catalogo',
  title: 'Catálogo y recetas',
  eyebrow: 'Configuración',
  icon: 'shopping-basket',
  summary: 'Insumos, subproductos, productos y recetas. De acá sale el costo real de cada plato.',
  intro:
    'El catálogo es el cimiento: si está mal armado, todo lo demás miente. El costo de un plato, el margen que ves en los reportes y el aviso de "agotado" en la caja salen de acá. Vale la pena hacerlo despacio una vez.',
  sections: [
    {
      id: 'las-tres-piezas',
      title: 'Las tres piezas',
      audience: ['dueno'],
      summary: 'Insumo, subproducto y producto. Cada uno cumple un papel distinto.',
      blocks: [
        {
          kind: 'table',
          head: ['Pieza', 'Qué es', 'Ejemplo'],
          rows: [
            ['Insumo', 'Lo que le compras al proveedor y no vendes tal cual.', 'Pollo crudo, sal, pan brioche.'],
            ['Subproducto', 'Algo que preparas y usas en varios platos. Tiene inventario propio.', 'Pollo sazonado, salsa de la casa.'],
            ['Producto', 'Lo que el cliente compra y tiene precio.', 'Hamburguesa, gaseosa, combo familiar.'],
          ],
        },
        {
          kind: 'rule',
          title: 'Una gaseosa no es un insumo',
          text: 'Lo que compras y revendes sin transformar (bebidas, snacks empacados) se carga como PRODUCTO de reventa, no como insumo. Tiene precio de venta y a la vez inventario y costo de compra. Forzarlo como insumo rompía la coherencia del catálogo.',
        },
      ],
    },
    {
      id: 'insumos',
      title: 'Cargar un insumo',
      audience: ['dueno'],
      where: 'Gestión → Catálogo → Insumos',
      summary: 'La clave está en el factor de conversión.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Nombre del insumo.' },
            { do: 'Unidad de compra: como se lo compras al proveedor (bulto, caja, litro).' },
            { do: 'Unidad de receta: como lo consume la cocina (gramos, mililitros, unidad).' },
            {
              do: 'Factor de conversión: cuántas unidades de receta trae una unidad de compra.',
              why: 'Un bulto de sal de 1.000 g lleva factor 1000. Sin ese número, el sistema no puede saber cuánto cuesta el gramo de sal que se fue en una hamburguesa.',
            },
            { do: 'Mínimo de alerta: por debajo de cuánto quieres que te avise.' },
          ],
        },
        {
          kind: 'prose',
          text: 'La casilla "Frena la venta si no hay stock" viene marcada. Desmárcala para consumibles como servilletas o sal: se siguen descontando y costeando, pero no bloquean la venta ni aparecen como deuda de inventario. Quedarte sin servilletas no debería impedirte vender hamburguesas.',
        },
        {
          kind: 'note',
          text: 'El costo del insumo no se escribe a mano: se actualiza solo cada vez que confirmas una factura de compra.',
        },
      ],
    },
    {
      id: 'subproductos',
      title: 'Cargar un subproducto',
      audience: ['dueno'],
      where: 'Gestión → Catálogo → Subproductos',
      summary: 'Lo que define un subproducto es cuánto rinde su receta.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Nombre y unidad (cómo cuentas cada porción).' },
            {
              do: 'Rendimiento: cuántas porciones salen de una preparación completa de la receta.',
              why: 'Si una olla de salsa rinde 7 porciones, pones 7. Con eso el sistema sabe que producir 14 consume dos recetas completas de insumos.',
            },
            { do: 'Mínimo de producción: por debajo de cuánto aparece como "falta producir" en la cocina.' },
            { do: 'Guarda y carga su receta.' },
          ],
        },
        {
          kind: 'note',
          text: 'Un subproducto puede llevar otro subproducto en su receta. Producir el de arriba consume del stock del de abajo, no de sus insumos — cada uno se produce por separado.',
        },
      ],
    },
    {
      id: 'productos',
      title: 'Cargar un producto',
      audience: ['dueno'],
      where: 'Gestión → Catálogo → Productos',
      summary: 'Cuatro tipos. Eliges uno al empezar y el formulario se adapta.',
      blocks: [
        {
          kind: 'table',
          head: ['Tipo', 'Cuándo', 'Ejemplo'],
          rows: [
            ['Preparado simple', 'Un precio, se hace con receta.', 'Hamburguesa clásica.'],
            ['Con variantes', 'La elección cambia el precio.', 'Burrito de pollo o de carne.'],
            ['Bebida o reventa', 'Se compra hecho y se revende.', 'Gaseosa 400 ml.'],
            ['Combo', 'Varios productos juntos a precio especial.', 'Combo familiar.'],
          ],
        },
        {
          kind: 'rule',
          title: 'Precio de venta y costo son cosas distintas',
          text: 'El precio base lo decides tú. El costo lo calcula el sistema desde la receta y las facturas, y se actualiza solo. Nunca escribas el costo a mano ni uses el precio de venta como costo: perderías el margen real, que es el único número que dice si el plato te deja algo.',
        },
        {
          kind: 'prose',
          text: 'Mientras armas la receta, el panel de costo muestra en vivo cuánto te cuesta el plato y qué margen deja al precio que pusiste.',
        },
      ],
    },
    {
      id: 'recetas',
      title: 'Armar la receta',
      audience: ['dueno'],
      where: 'Gestión → Catálogo → Productos → Receta',
      summary: 'Qué lleva y cuánto se pierde en el camino.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Agrega cada insumo o subproducto que entra, con la cantidad NETA (la que termina en el plato).' },
            {
              do: 'Pon el porcentaje de merma si se pierde parte en la preparación.',
              why: 'Si de 1 kg de pollo crudo sirves 800 g, la merma es 20%. El sistema descuenta el kilo entero del inventario, no los 800 g — porque el kilo entero es lo que sale de la nevera.',
            },
            { do: 'Guarda y revisa el costo expandido.' },
          ],
        },
        {
          kind: 'warn',
          text: 'La receta no puede tener ciclos: si A lleva B y B lleva A, el sistema lo rechaza. No es una limitación técnica, es que esa receta no se podría preparar en la vida real.',
        },
        {
          kind: 'note',
          text: 'Al vender un plato preparado se descuenta un solo nivel: sus subproductos directos y sus insumos directos. Los insumos que hay dentro de un subproducto ya se descontaron cuando se produjo la tanda.',
        },
      ],
    },
    {
      id: 'categorias',
      title: 'Categorías',
      audience: ['dueno'],
      where: 'Gestión → Catálogo → Categorías',
      summary: 'Cómo se agrupan los productos en la caja y en la web.',
      blocks: [
        {
          kind: 'prose',
          text: 'Las categorías ordenan el catálogo y definen los grupos que ve el cliente en la página. Todo producto necesita una: no puedes crear uno con una categoría que no exista.',
        },
        {
          kind: 'warn',
          text: 'Desactivar una categoría oculta TODOS sus productos, en la caja y en la web. Si desaparecieron productos de golpe, revisa primero acá.',
        },
      ],
    },
    {
      id: 'promociones',
      title: 'Promociones',
      audience: ['dueno'],
      where: 'Gestión → Catálogo → Promociones',
      summary: 'Cuatro tipos, con días, horas y canal.',
      blocks: [
        {
          kind: 'table',
          head: ['Tipo', 'Qué hace'],
          rows: [
            ['Descuento %', 'Un porcentaje sobre el producto.'],
            ['Descuento $', 'Un monto fijo. Nunca baja del subtotal del producto.'],
            ['Lleva X paga Y', 'Cuenta los juegos completos según la cantidad comprada.'],
            ['Combo', 'Porcentaje o monto fijo, solo si el producto es un combo.'],
          ],
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Elige el tipo y su valor.' },
            { do: 'Marca los días de la semana y la franja horaria.' },
            { do: 'Define desde cuándo y hasta cuándo vive.' },
            { do: 'Elige dónde aplica: en la caja, en la web o en ambas.' },
            { do: 'Selecciona los productos que cubre.' },
          ],
        },
        {
          kind: 'rule',
          title: 'Las promociones no se suman',
          text: 'Si dos promociones aplican al mismo producto, gana la que le deje MÁS pesos de descuento al cliente. Nunca se acumulan. Y si el cajero pone un descuento a mano, las promociones se apagan para todo ese pedido.',
        },
        {
          kind: 'note',
          text: 'Los campos propios del tipo no se pueden cambiar después de crear la promoción. Para cambiarlos, desactiva y crea una nueva: así el histórico de lo vendido con la promoción vieja sigue siendo cierto.',
        },
      ],
    },
  ],
};

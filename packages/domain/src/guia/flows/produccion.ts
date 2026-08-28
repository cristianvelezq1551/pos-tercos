import type { GuideFlow } from '../types';

export const FLOW_PRODUCCION: GuideFlow = {
  id: 'registrar-produccion',
  title: 'Registrar una producción',
  summary: 'Anotar una tanda de algo que se prepara con anticipación, para que sume al inventario y descuente sus insumos.',
  audience: ['cocina', 'dueno'],
  icon: 'cooking-pot',
  when:
    'Cada vez que preparas una tanda de un subproducto: pollo sazonado, salsa, masa. Al terminar de prepararla, no al final del día — hasta que no la registres, la caja cree que no hay y marca AGOTADO todo lo que la lleva.',
  before: [
    'El subproducto tiene que existir con su receta y su rendimiento cargados.',
    'Tiene que haber stock suficiente de los insumos que consume, o el sistema rechaza la tanda.',
  ],
  steps: [
    {
      do: 'Entra a Cocina → Producción. La lista muestra qué hay de cada subproducto y cuáles están por debajo del mínimo.',
      why: 'Los que dicen "Falta producir" están debajo del mínimo que cargó el dueño. Ese es tu orden de trabajo del día.',
    },
    { do: 'Toca "Producir" en el que acabas de preparar.' },
    {
      do: 'Escribe cuántas unidades SALIERON de verdad, no las que esperabas.',
      why: 'Si la receta rinde 7 porciones pero te salieron 6, escribe 6. El sistema descuenta los insumos de una receta completa igual, y la diferencia queda visible como merma real del proceso.',
    },
    { do: 'Si quieres, agrega una nota: lote, incidencia, quién la hizo.' },
    {
      do: 'Confirma. Aparece el detalle de lo que se descontó.',
      why: 'Ese detalle es tu comprobante. Si algo no cuadra con lo que usaste de verdad, es el momento de decirlo: después hay que corregirlo con movimientos compensatorios.',
    },
  ],
  sightings: [
    {
      where: 'Cocina → Producción',
      what: 'El subproducto sube su stock y, si estaba en "Falta producir", el aviso desaparece.',
    },
    {
      where: 'Cocina → Inventario → Stock',
      what: 'El subproducto con más cantidad, y los insumos que consumió con menos.',
      means: 'Producir mueve DOS cosas a la vez: suma lo que hiciste y resta lo que gastaste. Por eso una tanda genera varios renglones.',
    },
    {
      where: 'Caja → Vender',
      what: 'Los productos que llevan ese subproducto dejan de estar "Agotado" y se pueden vender.',
      means:
        'Esta es la razón operativa de registrar. Un producto preparado se marca agotado cuando le falta stock de CUALQUIERA de sus subproductos o insumos: cocinaste la salsa, pero si nadie registró la tanda, la hamburguesa sigue bloqueada.',
    },
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'Un renglón "Producción" positivo para el subproducto y uno negativo por cada insumo consumido, todos con el mismo origen.',
      means: 'Van encadenados a propósito: así se puede reconstruir qué entró en cada tanda.',
    },
    {
      where: 'Gestión → Cocina → pestaña Producción',
      what: 'Las tandas del período con quién las hizo y cuánto rindieron.',
    },
    {
      where: 'Gestión → Reportes → Costos y margen real',
      what: 'El costo del subproducto sale del costo real de los insumos que consumió esa tanda, dividido entre lo que rindió.',
      means:
        'Por eso una tanda con poco rendimiento encarece el plato: mismo costo de insumos repartido entre menos porciones. Es el mecanismo que hace visible un proceso que se está desperdiciando.',
      delay: 'Hasta un minuto.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Si no lo registras, no existe',
      text:
        'No importa que la olla esté llena: para el sistema, un subproducto sin tanda registrada tiene stock cero, y todo lo que lo lleve sale AGOTADO en la caja. Es la causa número uno de "no me deja vender algo que sí tengo".',
    },
    {
      kind: 'warn',
      text:
        'Si el sistema rechaza la producción por falta de insumos, casi nunca es que falten físicamente: es que falta cargar una compra. Revisa Gestión → Inventario → Deudas. Producir contra un inventario en negativo lo dejaría más torcido todavía.',
    },
    {
      kind: 'note',
      text:
        'Si un subproducto lleva OTRO subproducto en su receta, producir el de arriba consume del stock del de abajo, no de sus insumos. Cada uno se produce por separado, en orden.',
    },
  ],
  questions: [
    {
      q: 'Hice una olla de salsa pero no sé cuántas porciones son.',
      a: 'Mira el rendimiento que tiene cargado el subproducto: la pantalla de producción te lo muestra ("rinde 7 porciones"). Si preparaste una receta completa, son 7. Si hiciste doble, 14. Si te salieron menos porque se derramó, escribe las que realmente quedaron.',
    },
    {
      q: 'La caja dice AGOTADO pero yo tengo pollo sazonado en la nevera.',
      a: 'Falta registrar la tanda. Cocina → Producción → Producir en "Pollo sazonado" con las unidades que hay. Se desbloquea al instante. Si ya la registraste y sigue agotado, mira si falta OTRO insumo de la receta: basta que falte uno.',
    },
    {
      q: 'Registré 10 y en realidad fueron 8.',
      a: 'Registra una merma de 2 unidades del subproducto con el motivo "corrección de tanda mal registrada". No se puede editar la producción —los movimientos son permanentes— pero la merma deja el stock correcto y explica por qué.',
    },
    {
      q: '¿Tengo que producir todos los días aunque sobre de ayer?',
      a: 'No. Solo registras lo que preparas. Si te sobró de ayer, ese stock sigue ahí y la lista no te va a pedir producir hasta que baje del mínimo.',
    },
    {
      q: '¿Por qué me descontó pollo crudo si yo usé pollo que ya estaba adobado?',
      a: 'Porque la receta del subproducto dice que lleva pollo crudo. Si tu proceso real cambió, avísale al dueño para que actualice la receta: mientras la receta diga una cosa y la cocina haga otra, el costo del plato va a estar mal.',
    },
  ],
  seeAlso: ['cocina', 'catalogo', 'inventario'],
};

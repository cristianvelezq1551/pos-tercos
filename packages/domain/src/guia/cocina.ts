import type { GuideChapter } from './types';

export const COCINA: GuideChapter = {
  id: 'cocina',
  title: 'Cocina',
  eyebrow: 'Operación diaria',
  icon: 'cooking-pot',
  summary: 'La app del cocinero: recetas, producción, merma con foto, conteo a ciegas, incidencias y checklist.',
  intro:
    'La cocina tiene su propia aplicación, separada de la caja y de gestión. No es una pantalla de pedidos — para eso está la comanda impresa. Es la herramienta para saber cómo se hace cada cosa, registrar lo que se produce y avisar cuando algo pasa.',
  sections: [
    {
      id: 'que-ve',
      title: 'Qué ve el cocinero',
      audience: ['cocina', 'dueno'],
      summary: 'Cinco secciones y ni un solo precio.',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Biblia de recetas: cómo se prepara cada producto y subproducto.',
            'Producción: qué falta producir y cómo registrar una tanda.',
            'Inventario: ver existencias, registrar merma y hacer conteos.',
            'Incidencias: avisarle al dueño de un problema.',
            'Checklist: las rutinas de apertura y cierre.',
          ],
        },
        {
          kind: 'rule',
          title: 'Cantidades sí, costos nunca',
          text: 'El cocinero ve cuánto hay de cada cosa, jamás cuánto costó. El servidor le borra los costos a la respuesta antes de mandarla, así que no es cuestión de qué pantalla abra.',
        },
        {
          kind: 'note',
          text: 'La biblia es de solo lectura. Las recetas y los pasos los edita el dueño desde gestión — si la cocina pudiera cambiarlas, el costo de cada plato dejaría de tener sentido.',
        },
      ],
    },
    {
      id: 'biblia',
      title: 'Biblia de recetas',
      audience: ['cocina'],
      where: 'Cocina → Biblia',
      summary: 'Qué lleva cada producto y cómo se prepara, paso a paso.',
      blocks: [
        {
          kind: 'prose',
          text: 'Cada ficha muestra dos cosas: la composición (qué insumos y subproductos entran, con sus cantidades) y el paso a paso de preparación que escribió el dueño. La composición sale de la receta cargada en el sistema, así que si cambia la receta, cambia la ficha.',
        },
        {
          kind: 'note',
          text: 'Sirve para entrenar a alguien nuevo sin tener que estar al lado, y para resolver la duda de "¿cuánto pollo lleva?" sin preguntar.',
        },
      ],
    },
    {
      id: 'produccion',
      title: 'Producción',
      audience: ['cocina'],
      where: 'Cocina → Producción',
      summary: 'Registrar una tanda de algo que se prepara con anticipación.',
      blocks: [
        {
          kind: 'prose',
          text: 'Un subproducto es algo que se prepara aparte y después entra en varios platos: pollo sazonado, salsa, masa. Tiene su propio inventario. Cuando produces una tanda, el sistema suma lo que hiciste y descuenta los insumos que consumiste.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Entra a Producción. La lista muestra qué hay de cada subproducto y cuáles están por debajo del mínimo.' },
            { do: 'Toca el que vas a preparar y escribe cuántas unidades salieron.' },
            {
              do: 'Confirma. Aparece el detalle de lo que se descontó.',
              why: 'Ese detalle es tu comprobante: si algo no cuadra con lo que usaste de verdad, es el momento de decirlo.',
            },
          ],
        },
        {
          kind: 'rule',
          title: 'Si no lo registras, no existe',
          text: 'Un producto preparado se marca AGOTADO en la caja cuando le falta stock de alguno de sus subproductos. Si cocinaste la salsa pero nadie registró la tanda, el sistema cree que no hay y bloquea la venta de todo lo que la lleva.',
        },
        {
          kind: 'warn',
          text: 'La producción no puede dejar el inventario en negativo: si no alcanzan los insumos registrados, la rechaza. Eso casi siempre significa que falta cargar una compra, no que falte el insumo físicamente.',
        },
      ],
    },
    {
      id: 'merma',
      title: 'Merma',
      audience: ['cocina'],
      where: 'Cocina → Inventario → Registrar merma',
      summary: 'Lo que se dañó, se quemó o se cayó. Motivo y foto obligatorios.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Elige el insumo o subproducto y la cantidad que se perdió.' },
            { do: 'Escribe el motivo: se quemó, estaba vencido, se cayó.' },
            {
              do: 'Toma la foto de lo que se descarta. Sin foto no se puede guardar.',
              why: 'La merma es la única pérdida que nadie más ve. La foto es lo que la separa de "desapareció y alguien escribió merma".',
            },
          ],
        },
        {
          kind: 'prose',
          text: 'La merma se valora al costo real de lo que se fue y aparece en su propia línea del resultado del mes. Si el insumo no tenía compra registrada, se estima con el último precio conocido y queda marcado como aproximado hasta que llegue la factura.',
        },
        {
          kind: 'warn',
          text: 'Una merma mal escrita (10 kg en vez de 1 kg) NO se edita: los movimientos de inventario no se pueden modificar ni borrar nunca. Se corrige con "Anular" desde gestión, que registra la devolución. Avisa apenas te des cuenta.',
        },
      ],
    },
    {
      id: 'conteo',
      title: 'Conteo físico',
      audience: ['cocina'],
      where: 'Cocina → Inventario → Contar',
      summary: 'Contar de verdad lo que hay. A ciegas.',
      blocks: [
        {
          kind: 'prose',
          text: 'La pantalla de conteo no te muestra cuánto debería haber. Cuentas, escribes y el sistema ajusta la diferencia solo. Si te mostrara el número esperado, la tentación de escribir ese mismo número haría inútil el ejercicio.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Cuenta físicamente lo que hay de cada cosa de la lista.' },
            { do: 'Escribe la cantidad real.' },
            { do: 'Guarda. El ajuste queda registrado con tu nombre.' },
          ],
        },
        {
          kind: 'note',
          text: 'El dueño ve el resultado en gestión: qué se contó, qué se esperaba y de cuánto fue la diferencia.',
        },
      ],
    },
    {
      id: 'incidencias-checklist',
      title: 'Incidencias y checklist',
      audience: ['cocina'],
      where: 'Cocina → Incidencias · Cocina → Checklist',
      summary: 'Avisar de un problema y dejar constancia de las rutinas.',
      blocks: [
        {
          kind: 'prose',
          text: 'Las incidencias son el canal directo con el dueño: se dañó la nevera, llegó pollo en mal estado, falta gas. Se registran con categoría y descripción, y el dueño las ve en gestión y las marca como resueltas.',
        },
        {
          kind: 'prose',
          text: 'El checklist son las rutinas de apertura y cierre. Cada punto se marca uno por uno y se guarda al instante — si se va la luz a mitad, no pierdes lo que ya marcaste. Hay una rutina de apertura y una de cierre por día.',
        },
        {
          kind: 'note',
          text: 'Los puntos del checklist los define el dueño desde Gestión → Operación → Cocina. Si algo se repite mal todos los días, ahí se agrega.',
        },
      ],
    },
  ],
};

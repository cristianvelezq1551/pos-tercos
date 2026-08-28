import type { GuideFlow } from '../types';

export const FLOW_CONTEO: GuideFlow = {
  id: 'conteo-fisico',
  title: 'Hacer un conteo físico',
  summary: 'Contar lo que hay de verdad y dejar que el sistema ajuste la diferencia.',
  audience: ['cocina', 'dueno'],
  icon: 'clipboard-check',
  when:
    'Cuando el inventario dejó de ser creíble: aparecen negativos, o el stock del sistema no se parece a lo que ves en la nevera. También como rutina periódica, aunque nada se vea raro.',
  before: ['Terminar de registrar producciones y mermas pendientes: si cuentas primero y registras después, el ajuste queda mal.'],
  steps: [
    { do: 'Cocina → Inventario → pestaña Conteo físico.' },
    {
      do: 'Cuenta físicamente cada cosa de la lista y escribe la cantidad real.',
      why: 'La pantalla NO te muestra cuánto debería haber. Es a propósito: si vieras el número esperado, la tentación de escribir ese mismo número haría inútil el ejercicio.',
    },
    { do: 'Guarda. El sistema calcula la diferencia y registra el ajuste con tu nombre.' },
  ],
  sightings: [
    {
      where: 'Cocina → Inventario → Stock',
      what: 'El stock queda igual a lo que contaste.',
    },
    {
      where: 'Gestión → Inventario → Conteo físico',
      what: 'Qué se contó, qué se esperaba y de cuánto fue la diferencia.',
      means:
        'Esta comparación es el valor real del conteo. Una diferencia grande y repetida en el mismo insumo apunta a una receta mal cargada, a merma sin registrar o a que alguien se lo está llevando.',
    },
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'Un renglón de tipo "Ajuste manual" por cada diferencia.',
    },
    {
      where: 'Gestión → Inventario → Deudas',
      what: 'Los negativos desaparecen si el conteo los cuadró.',
    },
  ],
  pitfalls: [
    {
      kind: 'warn',
      text:
        'Un ajuste manual deja el número correcto pero NO explica por qué estaba mal. Si la causa es una compra sin cargar, sube la factura en vez de ajustar: además de la cantidad, arregla el costo. Ajustar tapa el síntoma y pierde la plata.',
    },
    {
      kind: 'note',
      text: 'Un ajuste negativo no puede dejar el stock bajo cero. Si la pérdida es real, va como merma, que sí queda valorada como pérdida.',
    },
  ],
  questions: [
    {
      q: 'Conté y me sobra pollo. ¿Está mal?',
      a: 'Suele significar que la receta descuenta más de lo que realmente usas —una merma cargada muy alta, por ejemplo— o que hubo una compra registrada de más. Cuadra con el conteo y revisa la receta con el dueño: si el desfase se repite mes a mes, la receta está mintiendo.',
    },
    {
      q: '¿Cuento todo o solo lo que se ve raro?',
      a: 'Puedes contar solo lo que necesitas. El dueño también puede dejarte tareas de conteo con una lista específica, para que no tengas que decidirlo tú.',
    },
  ],
  seeAlso: ['inventario', 'cocina'],
};

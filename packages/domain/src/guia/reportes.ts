import type { GuideChapter } from './types';

export const REPORTES: GuideChapter = {
  id: 'reportes',
  title: 'Reportes y control',
  eyebrow: 'Dueño',
  icon: 'line-chart',
  summary: 'Qué se vendió, qué deja plata, qué se pierde, y quién hizo qué.',
  intro:
    'Los reportes no son adornos: cada uno responde una pregunta concreta que cambia una decisión. Si un reporte no te está cambiando ninguna decisión, probablemente estás mirando el equivocado.',
  sections: [
    {
      id: 'inicio',
      title: 'Inicio',
      audience: ['dueno'],
      where: 'Gestión → Operación → Inicio',
      summary: 'El pulso del día, en una pantalla.',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Lo vendido hoy y cómo va contra el mismo día de la semana pasada.',
            'Pedidos web esperando confirmación de pago.',
            'Insumos en nivel crítico.',
            'Sugerencias de compra sin resolver.',
            'El resumen del día escrito por la inteligencia artificial.',
          ],
        },
        {
          kind: 'note',
          text: 'La comparación es contra el mismo día de la semana pasada, no contra ayer. Un martes se parece a otro martes, no a un lunes.',
        },
      ],
    },
    {
      id: 'ventas',
      title: 'Ventas',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Ventas',
      summary: 'Cuánto entró, por día o por hora, y por qué medio.',
      blocks: [
        {
          kind: 'prose',
          text: 'Eliges un rango y ves la serie en el tiempo más el desglose por tipo de venta y por medio de pago. Los totales muestran cantidad de ventas, ingresos, descuentos, anuladas y ticket promedio.',
        },
        {
          kind: 'note',
          text: 'Los ingresos se cuentan por la fecha del PAGO, no de la creación. Un pedido web creado el martes y pagado el miércoles cuenta el miércoles.',
        },
      ],
    },
    {
      id: 'productos',
      title: 'Productos',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Productos',
      summary: 'Qué se vende más y qué deja más.',
      blocks: [
        {
          kind: 'prose',
          text: 'El ranking muestra cantidad vendida, ingresos, costo y margen estimado de cada producto. El margen viene con color: verde arriba de 50%, azul sobre 30%, ámbar sobre 15% y rojo abajo.',
        },
        {
          kind: 'warn',
          text: 'El margen usa la receta VIGENTE, no la que estaba cuando se vendió. Si cambiaste la receta el mes pasado, el margen de las ventas anteriores está calculado con la receta nueva. Es una aproximación consciente: para el número exacto, mira Costos y margen real.',
        },
      ],
    },
    {
      id: 'costos',
      title: 'Costos y margen real',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Costos y margen real',
      summary: 'El costo verdadero, lote por lote.',
      blocks: [
        {
          kind: 'prose',
          text: 'Este reporte no estima: sigue cada lote comprado y calcula a qué precio salió cada unidad. Muestra el resultado del período, el margen real de cada producto y cuánto vale el inventario que tienes parado.',
        },
        {
          kind: 'note',
          text: 'Es el mismo cálculo que alimenta el estado financiero. Si un número no cuadra con el reporte de productos, este es el que manda.',
        },
      ],
    },
    {
      id: 'uso-mermas',
      title: 'Uso y mermas',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Uso y mermas',
      summary: 'A dónde se está yendo cada insumo.',
      blocks: [
        {
          kind: 'prose',
          text: 'Por cada insumo: cuánto se consumió en ventas, cuánto entró y salió por producción, cuánto se compró, cuánto se mermó, los ajustes netos, el porcentaje de merma y los pesos perdidos.',
        },
        {
          kind: 'note',
          text: 'Es el reporte para responder "¿por qué se me está acabando el pollo tan rápido?". Un porcentaje de merma que sube mes a mes casi siempre es un problema de proceso, no de precio.',
        },
      ],
    },
    {
      id: 'operacion',
      title: 'Operación',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Operación',
      summary: 'Las horas fuertes y cómo van los avisos y las sugerencias.',
      blocks: [
        {
          kind: 'prose',
          text: 'El mapa de calor cruza día de la semana con hora del día: te dice cuándo entra la plata de verdad, que es la base para decidir turnos y promociones. Además ves la cobertura de los avisos por WhatsApp y el estado de las sugerencias de compra.',
        },
      ],
    },
    {
      id: 'anomalias',
      title: 'Anomalías',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Anomalías',
      summary: 'Cuando alguien se sale de SU propio promedio.',
      blocks: [
        {
          kind: 'prose',
          text: 'Compara a cada persona contra su propio histórico, no contra los demás. Mira tres cosas: el tamaño de los descuadres, cuántas ventas anula y cuántas veces abre el cajón sin venta. Si un número se dispara respecto de lo normal en esa persona, se marca.',
        },
        {
          kind: 'rule',
          title: 'Una marca no es una acusación',
          text: 'Es una señal de que vale la pena mirar. Necesita al menos cinco turnos de historia para tener con qué comparar; con menos no dice nada. Y la mejor forma de usarla es preguntar, no sancionar: casi siempre hay una explicación operativa.',
        },
      ],
    },
    {
      id: 'reconciliacion',
      title: 'Reconciliación bancaria',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Reconciliación',
      summary: 'Cruzar el extracto del banco contra lo que dice el sistema.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Descarga el extracto del banco en formato CSV.' },
            { do: 'Súbelo eligiendo de qué banco es.' },
            { do: 'Revisa el resultado del cruce.' },
          ],
        },
        {
          kind: 'table',
          head: ['Marca', 'Qué significa'],
          rows: [
            ['Cruzado', 'El movimiento del banco tiene su venta. Todo bien.'],
            ['Sin venta', 'Entró plata al banco que el sistema no registró. Revisar primero.'],
            ['Sin movimiento', 'Hay una venta digital que el banco no muestra. Puede ser demora del banco o un cobro que nunca llegó.'],
          ],
        },
        {
          kind: 'note',
          text: 'El cruce es por pago, no por venta: una cuenta dividida en dos transferencias cruza cada abono por separado. Puedes guardar cada reporte para tener el histórico.',
        },
      ],
    },
    {
      id: 'bitacora',
      title: 'Bitácora y auditoría',
      audience: ['dueno'],
      where: 'Gestión → Auditoría',
      summary: 'Quién hizo qué, cuándo. Sin posibilidad de borrarlo.',
      blocks: [
        {
          kind: 'prose',
          text: 'La bitácora es la versión legible: filtras por caja, anulaciones, stock forzado, cortesías, aperturas de cajón, aprobaciones, sesiones, personal o cocina, y cada evento se lee en español con su detalle.',
        },
        {
          kind: 'prose',
          text: 'La auditoría completa es el registro crudo, con toda la información técnica de cada acción. Sirve cuando la bitácora no alcanza.',
        },
        {
          kind: 'rule',
          title: 'La auditoría no se puede modificar',
          text: 'Igual que el inventario, la base de datos rechaza cualquier edición o borrado. Ni el dueño puede tocarla. Es lo que hace que sirva como prueba: un registro que se puede editar no prueba nada.',
        },
      ],
    },
  ],
};

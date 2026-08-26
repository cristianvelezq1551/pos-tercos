import type { GuideChapter } from './types';

export const REGLAS: GuideChapter = {
  id: 'reglas',
  title: 'Reglas de oro',
  eyebrow: 'Para entender el sistema',
  icon: 'shield-check',
  summary: 'Las decisiones de fondo que explican por qué los números son como son. Si algo no te cuadra, la respuesta suele estar acá.',
  intro:
    'Este capítulo no explica cómo se hace algo: explica por qué el sistema se comporta como se comporta. Casi todas las veces que un número parece equivocado, en realidad está aplicando una de estas reglas.',
  sections: [
    {
      id: 'domicilio',
      title: 'El domicilio no es plata del negocio',
      audience: ['caja', 'dueno'],
      summary: 'Se cobra, se entrega al repartidor, y no aparece en ningún total.',
      blocks: [
        {
          kind: 'prose',
          text: 'Lo que el cliente paga por el envío se lo lleva quien reparte. El negocio solo lo transporta. Contarlo como ingreso inflaba las ventas, el ticket promedio y sobre todo el margen, porque el envío no consume nada de la cocina.',
        },
        {
          kind: 'table',
          head: ['Dónde', '¿Aparece el envío?'],
          rows: [
            ['Ventas, ingresos, resultado del mes, inicio', 'No.'],
            ['Cierre de caja, arqueo del cajón, arqueo de cuenta, historial de arqueos', 'No.'],
            ['Reconciliación bancaria', 'Sí, dentro del número: el banco sí lo recibió.'],
            ['Tarjeta "Domicilios del mes"', 'El único lugar donde se muestra.'],
          ],
        },
        {
          kind: 'warn',
          text: 'El sistema asume que a todo domiciliario se le pagó al entregar. Si alguna vez no fuera así, el arqueo mostraría un sobrante por ese monto. Es el precio de tener la caja limpia.',
        },
      ],
    },
    {
      id: 'nada-cuesta-cero',
      title: 'Nada de lo que sale cuesta cero',
      audience: ['dueno'],
      summary: 'Venta, cortesía, merma y producción se valoran igual.',
      blocks: [
        {
          kind: 'prose',
          text: 'Cuando un insumo sale del inventario, el sistema busca a qué precio se compró. Si no encuentra la compra, no lo deja en cero: lo estima con el último precio conocido y deja anotada una deuda.',
        },
        {
          kind: 'prose',
          text: 'Cuando llega la factura que faltaba, la deuda se salda y el costo estimado se reemplaza por el real. La corrección se imputa a la fecha en que se consumió, no a la de la factura — si cayera en el mes de la compra, el mes en que regalaste el producto quedaría subestimado para siempre.',
        },
        {
          kind: 'rule',
          title: 'Cero no es lo mismo que desconocido',
          text: 'Solo cuando no existe ningún precio con qué estimar, el costo queda marcado como desconocido. Eso es distinto de cero: cero afirma que no costó nada, y regalar comida siempre cuesta algo. Por eso las pantallas dicen "aproximado" en vez de mostrar una cifra cerrada que no lo es.',
        },
      ],
    },
    {
      id: 'insert-only',
      title: 'Lo que se registra no se borra',
      audience: ['caja', 'cocina', 'dueno'],
      summary: 'Inventario y auditoría son libros, no listas.',
      blocks: [
        {
          kind: 'prose',
          text: 'Los movimientos de inventario y la auditoría están protegidos en la base de datos: cualquier intento de editarlos o borrarlos se rechaza. Ni el dueño puede. Todo error se corrige con un registro nuevo que lo compensa, y quedan los dos a la vista.',
        },
        {
          kind: 'note',
          text: 'Puede parecer incómodo, pero es lo que permite responder "¿por qué hay 3 kg si compramos 10?" seis meses después.',
        },
      ],
    },
    {
      id: 'caja-unica',
      title: 'Una caja por día del negocio',
      audience: ['caja', 'dueno'],
      summary: 'No una por persona.',
      blocks: [
        {
          kind: 'prose',
          text: 'Hay una sola caja abierta a la vez en todo el negocio. Si cambia el turno de personas, se sigue vendiendo sobre la misma caja. Se cierra una vez, contando todo.',
        },
        {
          kind: 'prose',
          text: 'El día de esa caja va de las 4:00 am a las 3:59 am. Cerrar de madrugada no consume el cupo del día siguiente.',
        },
      ],
    },
    {
      id: 'whatsapp',
      title: 'Los avisos los manda una persona',
      audience: ['caja', 'dueno'],
      summary: 'El sistema escribe el mensaje; alguien toca enviar.',
      blocks: [
        {
          kind: 'prose',
          text: 'Ningún WhatsApp sale solo hacia un cliente o un proveedor. Cada botón abre el chat con el texto ya redactado desde el teléfono de quien lo toca. Así el otro responde en el hilo de siempre, en vez de escribirle a un número que nadie lee.',
        },
        {
          kind: 'note',
          text: 'Los mensajes no llevan emoji. No es una decisión de estilo: los iconos llegaban rotos a algunos teléfonos. La jerarquía la dan la negrita y los saltos de línea.',
        },
        {
          kind: 'prose',
          text: 'Las alertas al dueño (descuadres, cortesías, descuentos, anulaciones) sí salen automáticas, porque van a un número propio.',
        },
      ],
    },
    {
      id: 'dos-fechas',
      title: 'Las dos formas de contar el día',
      audience: ['dueno'],
      summary: 'La operación corta a las 4 am; la contabilidad, a medianoche.',
      blocks: [
        {
          kind: 'table',
          head: ['Qué', 'Cómo cuenta el día'],
          rows: [
            ['Caja, arqueo, historial, panel de pedidos', 'De 4:00 am a 3:59 am.'],
            ['Reportes de ventas, resultado del mes, inicio', 'De medianoche a medianoche, por fecha de pago.'],
            ['Nómina, costos fijos, tesorería, promociones, checklist', 'Día calendario.'],
          ],
        },
        {
          kind: 'rule',
          title: 'Por eso el turno no coincide con el reporte del día',
          text: 'Un turno que empezó el viernes a las 6 pm y cerró el sábado a las 2 am agrupa toda esa noche. El reporte del viernes solo llega hasta las 11:59 pm. La diferencia son las ventas de la madrugada, y no es un error: son dos preguntas distintas.',
        },
      ],
    },
    {
      id: 'estimados',
      title: 'Cuándo un número es aproximado',
      audience: ['dueno'],
      summary: 'El sistema lo dice en vez de disimularlo.',
      blocks: [
        {
          kind: 'bullets',
          items: [
            '"Aproximado" o "estimado": falta la factura de compra y el costo se calculó con el último precio conocido.',
            '"Está subestimado": no había ningún precio con qué estimar, así que ese pedazo quedó sin valorar.',
            'El margen del reporte de productos usa la receta vigente, no la del día de la venta.',
          ],
        },
        {
          kind: 'prose',
          text: 'Un estimado presentado como exacto es el mismo problema que ponerlo en cero: quien lee toma una cifra cerrada por buena. Por eso el sistema prefiere avisar.',
        },
      ],
    },
    {
      id: 'espera',
      title: 'Por qué a veces el número tarda',
      audience: ['dueno'],
      summary: 'Los cálculos de costo se guardan un minuto.',
      blocks: [
        {
          kind: 'prose',
          text: 'Recalcular el costo real recorre toda la historia de compras y consumos. Para no rehacerlo en cada consulta, el resultado se guarda por un minuto. Si acabas de subir una factura o de anular una merma y el resultado del mes no cambió todavía, espera un poco y vuelve a mirar.',
        },
      ],
    },
  ],
};

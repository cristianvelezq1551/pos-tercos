import type { GuideChapter } from './types';

export const FINANZAS: GuideChapter = {
  id: 'finanzas',
  title: 'El dinero del negocio',
  eyebrow: 'Dueño',
  icon: 'trending-up',
  summary: 'Tesorería, compromisos, costos fijos, nómina y el resultado del mes. Solo para el dueño.',
  intro:
    'Esta sección responde tres preguntas: cuánta plata hay, cuánta se debe y si el mes dio ganancia. Todo se calcula desde lo que ya pasó por el sistema — ventas, facturas, mermas, cortesías — no desde números escritos a mano.',
  sections: [
    {
      id: 'tesoreria',
      title: 'Tesorería',
      audience: ['dueno'],
      where: 'Gestión → Finanzas → Tesorería',
      summary: 'Dos bolsillos: efectivo y cuenta. Cuánto hay en cada uno.',
      blocks: [
        {
          kind: 'prose',
          text: 'Tesorería es la plata del negocio repartida en dos bolsillos. El saldo no se escribe: se deriva de todo lo que entró y salió desde la fecha de corte que definas.',
        },
        {
          kind: 'steps',
          title: 'Configurarla la primera vez',
          steps: [
            {
              do: 'Elige la fecha de corte: desde cuándo quieres contar.',
              why: 'Sirve para arrancar limpio sin arrastrar todo el histórico.',
            },
            { do: 'Escribe cuánto había en efectivo y cuánto en la cuenta ese día.' },
            { do: 'Guarda. De ahí en adelante el saldo se mueve solo.' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            'Traspaso: mover plata de un bolsillo al otro (consignar, retirar).',
            'Ajuste: corregir un saldo cuando la realidad no coincide, con motivo.',
          ],
        },
        {
          kind: 'rule',
          title: 'El bolsillo de efectivo NO es el cajón de la caja',
          text: 'Tesorería es toda la plata del negocio; el cajón del turno es un pedazo de ella. Por eso tesorería no lee los movimientos de la caja: si lo hiciera habría dos verdades para el mismo peso. Cuando pagas algo desde acá sale del bolsillo, no del cajón — y si sacaste los billetes del cajón, hay que registrar esa salida en la caja aparte.',
        },
      ],
    },
    {
      id: 'compromisos',
      title: 'Compromisos por pagar',
      audience: ['dueno'],
      where: 'Gestión → Finanzas → Compromisos por pagar',
      summary: 'Lo que el negocio le debe a alguien y todavía no pagó.',
      blocks: [
        {
          kind: 'prose',
          text: 'Acá se registra cualquier deuda que no venga de una factura de compra: un préstamo, un arreglo, un anticipo. Cada compromiso tiene monto, a quién y para cuándo, y se marca la antigüedad para que lo vencido salte a la vista.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Registra el compromiso con monto, responsable y fecha.' },
            { do: 'Cuando lo pagues, toca "Pagar" e indica de qué bolsillo salió.' },
            { do: 'Sube el comprobante si lo tienes.' },
          ],
        },
        {
          kind: 'note',
          text: 'Puedes abonar de a poco: los pagos parciales se van descontando hasta saldarlo.',
        },
      ],
    },
    {
      id: 'costos-fijos',
      title: 'Costos y gastos',
      audience: ['dueno'],
      where: 'Gestión → Finanzas → Costos y gastos',
      summary: 'Lo que se paga todos los meses y lo que se pagó una sola vez.',
      blocks: [
        {
          kind: 'prose',
          text: 'Un costo fijo es recurrente: arriendo, internet, servicios. Lo registras una vez con su periodicidad y el sistema genera los periodos que van venciendo. Un gasto único es lo que pasó una sola vez: una reparación, una compra de equipo.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Crea el costo con nombre, categoría, monto y cada cuánto se paga.' },
            { do: 'Cuando venza el periodo, aparece en pendientes.' },
            { do: 'Márcalo pagado indicando el bolsillo y sube el comprobante.' },
          ],
        },
        {
          kind: 'note',
          text: 'Los costos fijos son los que hacen posible el punto de equilibrio: cuánto tienes que vender al mes para no perder plata.',
        },
      ],
    },
    {
      id: 'nomina',
      title: 'Nómina',
      audience: ['dueno'],
      where: 'Gestión → Personal → Nómina',
      summary: 'Por semana, pagando los días que se trabajaron.',
      blocks: [
        {
          kind: 'prose',
          text: 'La nómina va por semana. La semana es la corrida de días laborables entre descansos: como el negocio cierra los lunes, la semana termina ahí — y si el lunes es festivo, el descanso se corre al martes y la semana cierra igual.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Abre la semana y marca los días trabajados de cada persona.' },
            { do: 'Agrega bonos o descuentos si los hubo.' },
            { do: 'Toca "Pagar" y selecciona los días que estás pagando.' },
            { do: 'Reparte el monto entre efectivo y cuenta, y sube el comprobante.' },
          ],
        },
        {
          kind: 'rule',
          title: 'Pagar la nómina no toca el cajón',
          text: 'La plata sale del bolsillo de tesorería, no de la caja del turno. Antes lo hacía y producía descuadres grandes: se pagaba nómina y el arqueo del turno mostraba una salida enorme de efectivo que nunca había salido del cajón. Si sacaste los billetes del cajón, registra la salida en la caja a mano.',
        },
        {
          kind: 'note',
          text: 'Las propinas del período se muestran repartidas por persona, proporcionalmente a los días trabajados. Es informativo: no entran en el total a pagar.',
        },
      ],
    },
    {
      id: 'estado',
      title: 'Estado financiero',
      audience: ['dueno'],
      where: 'Gestión → Finanzas → Estado financiero',
      summary: 'El resultado del mes, línea por línea.',
      blocks: [
        {
          kind: 'table',
          head: ['Línea', 'Qué es'],
          rows: [
            ['Ventas a precio de lista', 'Lo que habría entrado sin ningún descuento.'],
            ['− Descuentos y promociones', 'Lo que se dejó de cobrar a propósito.'],
            ['Ingresos del mes', 'Lo que efectivamente entró. Sin el domicilio.'],
            ['− Costo real de lo vendido', 'Lo que costaron los insumos que se fueron, al precio real al que se compraron.'],
            ['Margen bruto', 'Lo que queda antes de los gastos.'],
            ['− Costos fijos', 'Arriendo, servicios, lo recurrente.'],
            ['− Gastos únicos', 'Lo que pasó una sola vez este mes.'],
            ['− Cortesías', 'Lo regalado, a costo.'],
            ['− Reembolsos', 'Comida preparada y devuelta, a costo.'],
            ['− Merma', 'Lo que se tiró, a costo.'],
            ['Resultado neto', 'Lo que quedó.'],
          ],
        },
        {
          kind: 'rule',
          title: 'El costo es real, no estimado',
          text: 'El costo de lo vendido se calcula lote por lote, en orden de llegada: lo que se vendió hoy se costea al precio del lote más viejo que había. Por eso una factura vieja subida tarde cambia números de meses anteriores — y por eso vale la pena subirlas.',
        },
        {
          kind: 'warn',
          text: 'Cuando una línea dice "aproximado", es porque parte de ese costo se estimó con el último precio conocido: falta la factura de compra. Cuando la subas, el número se corrige solo.',
        },
        {
          kind: 'prose',
          text: 'En la misma pantalla están el punto de equilibrio (cuánto hay que vender para no perder), la tendencia de los últimos seis meses, la tarjeta de domicilios del mes y un análisis escrito por la inteligencia artificial sobre lo que muestran los números.',
        },
      ],
    },
    {
      id: 'domicilios',
      title: 'Domicilios del mes',
      audience: ['dueno'],
      where: 'Gestión → Finanzas → Estado financiero',
      summary: 'El único lugar donde se ve el envío. Y es un dato de decisión.',
      blocks: [
        {
          kind: 'rule',
          title: 'El domicilio no es ingreso del negocio',
          text: 'Lo que cobras por el envío se lo lleva el repartidor. Contarlo como ingreso inflaba las ventas, el ticket promedio y —peor— el margen, porque el envío no consume inventario. Por eso no aparece en ventas, ni en el resultado del mes, ni en el arqueo de caja: en ningún total.',
        },
        {
          kind: 'prose',
          text: 'La tarjeta muestra el total del mes, cuántas entregas fueron y el promedio por entrega. Sirve para una sola decisión: cuándo conviene contratar un repartidor propio en vez de pagar por viaje.',
        },
      ],
    },
  ],
};

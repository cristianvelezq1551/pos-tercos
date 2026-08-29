import type { GuideFlow } from '../types';

export const FLOW_TESORERIA: GuideFlow = {
  id: 'tesoreria',
  area: 'finanzas',
  title: 'Manejar la tesorería',
  summary: 'Saber cuánta plata hay en efectivo y cuánta en la cuenta, y mover entre las dos.',
  audience: ['dueno'],
  icon: 'wallet',
  when:
    'Configurarla, una vez al empezar. Traspasos y ajustes, cada vez que muevas plata entre bolsillos o que la realidad no coincida con el sistema.',
  before: ['Saber cuánto hay hoy en efectivo y en la cuenta, para el punto de partida.'],
  steps: [
    { do: 'Gestión → Finanzas → Tesorería.' },
    {
      do: 'La primera vez: elige la fecha de corte y escribe los saldos iniciales de cada bolsillo.',
      why: 'El corte sirve para arrancar limpio sin arrastrar todo el histórico. De ahí en adelante el saldo se mueve solo con lo que entra y sale.',
    },
    { do: 'Para consignar o retirar: "Traspaso", eligiendo de qué bolsillo a cuál.' },
    {
      do: 'Si un saldo no coincide con la realidad: "Ajuste", con el motivo.',
      why: 'El ajuste deja el número correcto pero no explica la causa. Úsalo cuando de verdad no puedas rastrearla.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Finanzas → Tesorería',
      what: 'Los dos bolsillos con su saldo y la lista de movimientos.',
      means: 'El saldo no se escribe: se deriva de todo lo que entró y salió desde el corte.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'El neto de caja del mes: lo que entró menos lo pagado.',
    },
    {
      where: 'Gestión → Finanzas → Pagos y cobros',
      what: 'Cada pago que hiciste descontando del bolsillo que elegiste.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'El bolsillo Efectivo NO es el cajón de la caja',
      text:
        'Tesorería es toda la plata del negocio; el cajón del turno es un pedazo. Por eso tesorería no lee los movimientos de la caja: si lo hiciera habría dos verdades para el mismo peso. Cuando pagas algo desde acá sale del bolsillo, no del cajón — y si sacaste los billetes del cajón, hay que registrar esa salida en la caja aparte.',
    },
    {
      kind: 'warn',
      text:
        'Si el efectivo no cuadra y ajustas sin buscar la causa, el ajuste tapa el problema. Revisa primero los arqueos de los últimos turnos: casi siempre está ahí.',
    },
  ],
  questions: [
    {
      q: 'Consigné la plata del fin de semana.',
      a: 'Traspaso de Efectivo a Cuenta por ese monto. No es un ingreso ni un gasto: la misma plata cambió de bolsillo.',
    },
    {
      q: '¿Por qué el efectivo de tesorería no coincide con lo que hay en el cajón?',
      a: 'Porque no son lo mismo. El cajón es solo la plata del turno actual; tesorería incluye lo que ya sacaste, lo que tienes guardado y lo que no pasó por la caja. Para cuadrar el cajón, mira el arqueo del turno.',
    },
  ],
  seeAlso: ['finanzas', 'reglas'],
};

export const FLOW_NOMINA: GuideFlow = {
  id: 'pagar-nomina',
  area: 'finanzas',
  title: 'Pagar la nómina de la semana',
  summary: 'Marcar los días trabajados, agregar bonos o descuentos y pagar, con comprobante.',
  audience: ['dueno'],
  icon: 'users',
  when:
    'Al cerrar la semana. La semana es la corrida de días laborables entre descansos: como el negocio cierra los lunes, ahí termina — y si el lunes es festivo, el descanso se corre al martes y la semana cierra igual.',
  before: ['Los empleados tienen que existir como usuarios, con su salario cargado.'],
  steps: [
    { do: 'Gestión → Personal → Nómina. Abre la semana.' },
    { do: 'Marca los días que trabajó cada persona.' },
    { do: 'Agrega bonos o descuentos si los hubo, con su motivo.' },
    { do: 'Toca "Pagar" y selecciona los días que estás pagando.' },
    {
      do: 'Reparte el monto entre Efectivo y Cuenta según de dónde salió, y sube el comprobante.',
      why: 'Ese reparto descuenta del bolsillo correspondiente en tesorería. Si pagaste mitad y mitad, ponlo así.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Personal → Nómina',
      what: 'Lo devengado, lo abonado y lo que falta, por persona y por semana.',
      means: 'Puedes abonar parcial: el restante queda pendiente y se ve en la siguiente visita.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'Entra como costo del mes en el que pagaste.',
    },
    {
      where: 'Gestión → Finanzas → Tesorería',
      what: 'Baja el bolsillo del que pagaste.',
    },
    {
      where: 'Gestión → Finanzas → Compromisos por pagar',
      what: 'Lo devengado y no pagado aparece como deuda pendiente.',
      means: 'Incluye la semana en curso con lo devengado hasta hoy, así "cuánto debo realmente" responde a hoy y no solo a semanas cerradas.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Pagar la nómina NO toca el cajón',
      text:
        'La plata sale del bolsillo de tesorería. Antes lo hacía y producía descuadres grandes: se pagaba nómina y el arqueo del turno mostraba una salida enorme de efectivo que nunca había salido del cajón. Si sacaste los billetes del cajón, registra la salida en la caja a mano.',
    },
    {
      kind: 'note',
      text:
        'Las propinas del período se muestran repartidas por persona, proporcionalmente a los días trabajados. Es informativo: NO entran al total a pagar.',
    },
  ],
  questions: [
    {
      q: 'Alguien trabajó medio día.',
      a: 'Márcalo como día trabajado y usa un descuento por la diferencia, con el motivo. Así queda explicado en vez de quedar como un número raro.',
    },
    {
      q: 'Pagué de más la semana pasada.',
      a: 'Anula ese abono: la plata vuelve al bolsillo por dejar de contar como gasto pagado. Después registras el correcto.',
    },
  ],
  seeAlso: ['finanzas'],
};

export const FLOW_LEER_PYG: GuideFlow = {
  id: 'leer-estado-financiero',
  area: 'finanzas',
  title: 'Leer el resultado del mes',
  summary: 'Entender línea por línea si el mes dio ganancia, y de dónde salió cada número.',
  audience: ['dueno'],
  icon: 'trending-up',
  when: 'Cerrando el mes, y a mitad de mes para corregir a tiempo. Es la pantalla que responde "¿esto está funcionando?".',
  before: [
    'Tener las facturas de compra confirmadas: sin ellas el costo es estimado.',
    'Tener los costos fijos del mes marcados como pagados.',
  ],
  steps: [
    { do: 'Gestión → Finanzas → Estado financiero. Elige el mes.' },
    {
      do: 'Lee de arriba abajo: ventas a precio de lista, menos descuentos, igual ingresos.',
      why: 'La diferencia entre las dos primeras líneas es lo que costaron las promociones y los descuentos manuales.',
    },
    {
      do: 'Ingresos menos el costo real de lo vendido igual margen bruto.',
      why: 'El costo sale lote por lote, en orden de llegada: lo que se vendió hoy se costea al precio del lote más viejo que había.',
    },
    { do: 'Réstale costos fijos, gastos únicos, cortesías, reembolsos y merma. Eso es el resultado neto.' },
    { do: 'Mira el punto de equilibrio: cuánto tienes que vender al mes para no perder.' },
  ],
  sightings: [
    {
      where: 'La línea "Ingresos del mes"',
      what: 'Lo que se queda el negocio.',
      means: 'NO incluye el cobro del domicilio: esa plata es del repartidor. Contarla inflaría ventas, ticket promedio y sobre todo el margen, porque el envío no consume inventario.',
    },
    {
      where: 'La línea "− COGS (costo real FIFO)"',
      what: 'Lo que costaron los insumos que se fueron.',
      means: 'Si dice "estimado", falta alguna factura y ese pedazo se calculó con el último precio conocido. Al subirla, el número se corrige solo.',
    },
    {
      where: 'Las líneas de cortesías, reembolsos y merma',
      what: 'Las tres pérdidas, separadas y a costo.',
      means: 'Están aparte a propósito: son decisiones distintas. Regalar es comercial, reembolsar es un error de servicio, mermar es de proceso.',
    },
    {
      where: 'La tarjeta "Domicilios del mes"',
      what: 'Total, cantidad y promedio de los envíos cobrados.',
      means: 'El único lugar donde se ve el envío. Sirve para una sola decisión: cuándo conviene contratar repartidor propio.',
    },
    {
      where: 'El análisis escrito por la IA',
      what: 'Una lectura en palabras de lo que muestran los números.',
      means: 'Es apoyo, no reemplazo: los números de arriba mandan.',
    },
  ],
  pitfalls: [
    {
      kind: 'warn',
      text:
        'Un mes con facturas sin subir se ve mejor de lo que fue: el costo queda estimado por lo bajo. Antes de sacar conclusiones, revisa que no haya líneas marcadas como aproximadas.',
    },
    {
      kind: 'note',
      text: 'El cálculo se guarda un minuto. Si acabas de confirmar una factura y el número no cambió, espera y vuelve a mirar.',
    },
  ],
  questions: [
    {
      q: 'Vendí mucho pero el resultado es bajo.',
      a: 'Mira en orden: margen bruto (si es bajo, el problema es el costo o el precio), después costos fijos (si se comen el margen, el problema es la estructura), y por último cortesías, reembolsos y merma sumados. Cada línea apunta a una acción distinta.',
    },
    {
      q: 'Las ventas del reporte no coinciden con lo que sumé de los turnos.',
      a: 'Son dos preguntas distintas. El turno agrupa por caja y puede cruzar medianoche; el reporte agrupa por fecha de pago. En noches que pasan de las 12, no van a coincidir y está bien.',
    },
    {
      q: '¿Por qué la merma aparece con "aprox."?',
      a: 'Porque falta la factura del insumo que se mermó, así que su costo se estimó con el último precio conocido. Sube la factura y el número se vuelve exacto, imputado al mes en que se consumió.',
    },
  ],
  seeAlso: ['finanzas', 'reportes', 'reglas'],
};

export const FLOW_COMPROMISO: GuideFlow = {
  id: 'compromiso-por-pagar',
  area: 'finanzas',
  title: 'Registrar un compromiso por pagar',
  summary: 'Anotar una deuda puntual que no es factura de compra ni costo recurrente.',
  audience: ['dueno'],
  icon: 'hand-coins',
  when: 'Un préstamo, un arreglo que quedaste debiendo, un anticipo. Cuando nace el compromiso, no cuando lo pagas.',
  before: [],
  steps: [
    { do: 'Gestión → Finanzas → Compromisos por pagar → Nuevo.' },
    { do: 'Monto, a quién y para cuándo.' },
    { do: 'Cuando pagues: "Pagar", con el bolsillo del que salió y el comprobante.' },
  ],
  sightings: [
    {
      where: 'Gestión → Finanzas → Compromisos por pagar',
      what: 'Los pendientes con su antigüedad, para que lo vencido salte a la vista.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'Al pagarlo entra como gasto del mes del pago.',
    },
    {
      where: 'Gestión → Finanzas → Tesorería',
      what: 'Baja el bolsillo elegido.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text: 'Puedes abonar de a poco: los pagos parciales se van descontando hasta saldarlo.',
    },
    {
      kind: 'warn',
      text:
        'Lo que le debes a un proveedor de insumos NO va acá: eso entra por Compras → Facturas sin marcar como pagada, y así además actualiza el costo de tus platos.',
    },
  ],
  questions: [
    {
      q: '¿Arriendo acá o en costos fijos?',
      a: 'En costos fijos: se repite todos los meses y el sistema genera el período solo. Compromisos es para lo puntual que no se repite.',
    },
  ],
  seeAlso: ['finanzas'],
};

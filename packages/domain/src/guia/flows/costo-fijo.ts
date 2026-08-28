import type { GuideFlow } from '../types';

export const FLOW_COSTO_FIJO: GuideFlow = {
  id: 'registrar-costo-fijo',
  title: 'Registrar y pagar un costo fijo',
  summary: 'Dar de alta un gasto recurrente (arriendo, servicios) o uno único, y marcarlo pagado cuando salga la plata.',
  audience: ['dueno'],
  icon: 'coins',
  when:
    'El recurrente se carga UNA vez, cuando aparece el compromiso: firmaste el arriendo, contrataste el internet. De ahí en adelante el sistema genera solo el período de cada mes y te lo pone en pendientes. El único se carga cuando pasa: una reparación, un equipo.',
  before: ['Nada. Es de los pocos flujos que no depende de que exista otra cosa antes.'],
  steps: [
    { do: 'Gestión → Finanzas → Costos y gastos → Nuevo.' },
    {
      do: 'Nombre y monto.',
      why: 'El nombre es lo que vas a leer en el resultado del mes. "Arriendo local" se entiende; "pago mensual" no.',
    },
    {
      do: 'Frecuencia: Mensual si se repite, Único si pasó una sola vez.',
      why: 'Mensual genera un período por mes que hay que ir marcando pagado. Único es un gasto de ese mes y ya: no vuelve a pedirte nada.',
    },
    { do: 'Categoría, para agruparlo en el resultado del mes.' },
    {
      do: 'Vigente desde (y hasta, si tiene fin conocido).',
      why: 'Define desde qué mes empieza a pedirte el pago. Si cargas hoy un arriendo que empezó hace tres meses, pon la fecha real: el sistema genera los períodos que faltan.',
    },
    { do: 'Guarda.' },
    {
      do: 'Cuando pagues: entra al costo, toca "Pagar", pon la fecha real del pago y el monto que salió de verdad.',
      why: 'El monto real puede diferir del esperado: el recibo de la luz nunca da igual dos meses. Lo que entra al resultado del mes es lo que pagaste, no lo que estimaste.',
    },
    {
      do: 'Reparte entre Efectivo y Cuenta según de dónde salió la plata, y sube el comprobante.',
      why: 'Ese reparto es lo que descuenta de los bolsillos de tesorería. Si pagaste mitad y mitad, ponlo así.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Finanzas → Costos y gastos',
      what: 'El costo en la lista y, abajo, los períodos pendientes de pago.',
      means: 'Un período pendiente es plata que debes este mes y todavía no sale de ningún lado. Es tu lista de "por pagar".',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'Dentro del bloque "Costos fijos (recurrentes)" o "Gastos únicos del mes", restando del resultado.',
      means:
        'Solo entra lo PAGADO en ese mes. Un período generado pero no pagado no resta todavía: el resultado del mes cuenta plata que salió, no compromisos.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero → Punto de equilibrio',
      what: 'La suma de tus costos fijos define cuánto tienes que vender al mes para no perder.',
      means: 'Es el uso más útil de este dato: cada costo fijo que agregas sube la barra que tienes que pasar todos los meses.',
    },
    {
      where: 'Gestión → Finanzas → Tesorería',
      what: 'El bolsillo del que pagaste baja por ese monto.',
      means:
        'Efectivo y Cuenta son los dos bolsillos del negocio. Lo que marques acá se descuenta del que corresponda; por eso importa repartirlo bien.',
    },
    {
      where: 'Gestión → Finanzas → Pagos y cobros',
      what: 'El pago en el flujo de caja del período, con su comprobante.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Pagar desde acá NO toca la caja del turno',
      text:
        'La plata sale del bolsillo de tesorería, que es la plata del negocio. El cajón del turno es solo un pedazo de ella. Si además sacaste los billetes del cajón, hay que registrar esa salida a mano en Caja → Caja → Movimientos, o el arqueo de ese turno va a marcar faltante.',
    },
    {
      kind: 'warn',
      text:
        'No cargues como costo fijo lo que le compras a un proveedor de insumos. Eso entra por Compras → Facturas, que además actualiza el costo de tus platos. Cargarlo acá lo contaría como gasto pero dejaría tus márgenes mintiendo.',
    },
    {
      kind: 'note',
      text:
        'Si un costo dejó de existir (cerraste ese servicio), pon "Vigente hasta" en vez de borrarlo. Así el historial de los meses en que sí lo pagaste sigue siendo cierto.',
    },
  ],
  questions: [
    {
      q: '¿El arriendo va acá o en compromisos por pagar?',
      a: 'Acá, como costo fijo mensual: se repite todos los meses y el sistema te va generando el período. Compromisos por pagar es para deudas puntuales que no se repiten — un préstamo, un arreglo que quedaste debiendo.',
    },
    {
      q: 'La luz me llegó más cara este mes.',
      a: 'Al marcar pagado escribe el monto REAL. El sistema no te obliga a pagar lo estimado; lo que entra al resultado del mes es lo que efectivamente salió.',
    },
    {
      q: 'Pagué el arriendo en efectivo, sacándolo de la caja.',
      a: 'Dos registros, no uno. Acá marcas el costo pagado con reparto 100% Efectivo (baja el bolsillo del negocio). Y en Caja → Caja → Movimientos registras una salida de efectivo por el mismo monto, con el motivo. Sin el segundo, el arqueo de ese turno marca faltante.',
    },
    {
      q: 'Se me olvidó cargar el arriendo de hace tres meses.',
      a: 'Créalo con "Vigente desde" en la fecha real: el sistema genera los períodos que faltan y los pone en pendientes. Los marcas pagados con su fecha real y cada uno cae en el mes que le corresponde.',
    },
    {
      q: '¿Por qué mi resultado del mes no baja si ya cargué el costo?',
      a: 'Porque solo resta lo pagado. Cargar el costo crea el compromiso; marcarlo pagado es lo que lo lleva al resultado del mes y descuenta el bolsillo.',
    },
  ],
  seeAlso: ['finanzas', 'reportes'],
};

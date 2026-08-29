import type { GuideFlow } from '../types';

export const FLOW_PEDIR_PROVEEDOR: GuideFlow = {
  id: 'pedir-a-proveedor',
  area: 'compras',
  title: 'Armar el pedido y mandárselo al proveedor',
  summary: 'Juntar lo que falta en una lista, imprimirla o mandarla por WhatsApp desde tu número.',
  audience: ['dueno'],
  icon: 'truck',
  when: 'Antes de cada pedido. El sistema ya detectó solo qué está bajo el mínimo; esto lo convierte en una orden.',
  before: ['Los proveedores cargados, con teléfono si quieres mandarlo por WhatsApp.'],
  steps: [
    {
      do: 'Gestión → Compras → Sugerencias inteligentes para ver lo que está bajo mínimo.',
      why: 'El sistema revisa cada hora y propone la cantidad para volver al doble del mínimo, en unidad de compra.',
    },
    {
      do: 'Si quieres una segunda opinión, "Evaluar con IA".',
      why: 'Mira tu histórico de compras de ese insumo y dice si la cantidad tiene sentido. Cuesta centavos y solo corre cuando tú lo pides.',
    },
    { do: 'Para pedir varias cosas juntas: Gestión → Compras → Listas de faltantes → Nueva.' },
    { do: 'Agrega los ítems con su cantidad. Si repites uno, se funde en un solo renglón.' },
    { do: 'Imprime la lista general, o la partida por proveedor.' },
    {
      do: 'Para mandarlo por WhatsApp: elige proveedor, revisa la vista previa y toca "Abrir WhatsApp".',
      why: 'El mensaje se manda desde TU número, no desde un número del sistema. Así el proveedor te responde en el hilo de siempre.',
    },
    { do: 'Cuando ya pediste, cierra la lista.' },
  ],
  sightings: [
    {
      where: 'Gestión → Compras → Listas de faltantes',
      what: 'Las abiertas y el historial de las cerradas, con quién las hizo.',
      means: 'Cerrar significa "ya se pidió": queda de historial y no se edita más.',
    },
    {
      where: 'Gestión → Compras → Proveedores',
      what: 'Qué te ha vendido cada uno y a qué precio la última vez.',
      means: 'Sirve para ver si te subieron el precio antes de volver a pedir.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora',
      what: 'Qué se pidió, a quién y quién lo mandó.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'El mensaje al proveedor NUNCA habla de precios',
      text:
        'Ni el último que te cobró, ni un estimado, ni "cotízanos". Lo que cobra se negocia en el chat: sacar a relucir el precio viejo ancla la conversación en el peor lugar. Tú sí ves el último precio en la pantalla — es información interna y no viaja en el mensaje.',
    },
    {
      kind: 'note',
      text:
        'El papel del proveedor no lleva costos; el general sí. Le entregas al proveedor lo que necesita saber, no lo que tú pagas.',
    },
    {
      kind: 'warn',
      text: 'Una preparación de cocina no se puede pedir: se produce. Si necesitas más salsa, lo que se pide son sus insumos.',
    },
  ],
  questions: [
    {
      q: 'Imprimí la lista. ¿Ya quedó pedido?',
      a: 'No. Sacar el papel no es haber pedido: la lista sigue abierta hasta que la cierres. Ciérrala cuando de verdad hayas hecho el pedido.',
    },
    {
      q: 'El proveedor no tiene teléfono cargado.',
      a: 'El botón de WhatsApp queda deshabilitado y te lo explica. Cárgale el teléfono en Gestión → Compras → Proveedores.',
    },
  ],
  seeAlso: ['compras'],
};

export const FLOW_ANULAR_MERMA: GuideFlow = {
  id: 'anular-merma',
  area: 'inventario',
  title: 'Anular una merma mal registrada',
  summary: 'Corregir una merma equivocada devolviendo las unidades con su costo original.',
  audience: ['dueno'],
  icon: 'undo',
  when: 'Alguien escribió 10 kg en vez de 1, o registró la merma del insumo equivocado.',
  before: ['Saber cuánto se mermó de más: puedes devolver solo una parte.'],
  steps: [
    { do: 'Gestión → Inventario → Movimientos. Filtra por tipo Merma y busca el renglón.' },
    { do: 'Toca "Anular" en esa fila.' },
    { do: 'Escribe cuánto devolver y el motivo.' },
    {
      do: 'Confirma. Vuelven las unidades con el costo que tenían.',
      why: 'No basta con devolver la cantidad: si no volviera también el costo, la pérdida seguiría restando del resultado del mes para siempre.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'Un renglón nuevo que compensa, junto al original.',
      means: 'Quedan los dos a la vista. Los movimientos son insert-only: nada se edita ni se borra, y eso es lo que permite auditar.',
    },
    {
      where: 'Gestión → Reportes → Uso y mermas',
      what: 'El porcentaje de merma de ese insumo baja.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'La línea de merma se netea por el costo devuelto.',
      means: 'El neteo cae en el MES DEL CONSUMO original, no en el de la corrección: si no, el mes en que se mermó quedaría mal para siempre.',
      delay: 'Hasta un minuto.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text: 'Puedes anular de a poco. Nunca más de lo que se mermó, y el botón desaparece cuando ya se devolvió todo.',
    },
  ],
  questions: [
    {
      q: 'Mermaron el insumo equivocado.',
      a: 'Anula esa merma completa y registra la correcta sobre el insumo que sí se perdió. Quedan los tres movimientos y la historia se entiende.',
    },
  ],
  seeAlso: ['inventario'],
};

export const FLOW_DEUDAS: GuideFlow = {
  id: 'resolver-deudas-inventario',
  area: 'inventario',
  title: 'Resolver las deudas de inventario',
  summary: 'Poner en cuadre los insumos que están en negativo.',
  audience: ['dueno'],
  icon: 'trending-down',
  when:
    'Cuando la pantalla de Deudas tiene filas, o cuando la cocina reporta que algo sale agotado teniéndolo. Vale la pena revisarla una vez por semana.',
  before: [],
  steps: [
    { do: 'Gestión → Inventario → Deudas.' },
    {
      do: 'Por cada insumo en negativo, busca la factura de compra que falta.',
      why: 'Un negativo casi nunca es un error de la caja: significa que se consumió más de lo que estaba cargado, y eso pasa cuando falta subir una compra.',
    },
    {
      do: 'Súbela y confírmala. La deuda se salda sola.',
      why: 'Y no solo la cantidad: el costo que se había estimado para las ventas ya salidas se corrige al costo real, imputado al mes en que se consumió.',
    },
    { do: 'Si de verdad no hay factura, corrige con un conteo físico.' },
  ],
  sightings: [
    {
      where: 'Gestión → Inventario → Deudas',
      what: 'La lista se vacía a medida que resuelves.',
      means: 'Los consumibles aparecen en una lista aparte: viven en negativo por diseño y no piden acción.',
    },
    {
      where: 'Gestión → Inicio',
      what: 'El contador de stock crítico baja.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'Las líneas que decían "aproximado" pasan a costo real.',
      means: 'Ese es el efecto de fondo: mientras haya deudas, tu margen es una estimación.',
    },
  ],
  pitfalls: [
    {
      kind: 'warn',
      text:
        'Cuadrarlo con un ajuste manual deja el número bien pero pierde la plata: el costo real de esa compra nunca entra y el margen queda inflado. El ajuste es el último recurso, no el primero.',
    },
  ],
  questions: [
    {
      q: '¿Por qué tengo insumos en negativo si la caja no deja vender sin stock?',
      a: 'Tres causas: alguien forzó la venta, la receta descuenta más de lo que refleja la compra cargada, o simplemente falta subir una factura. La tercera es la más común con diferencia.',
    },
  ],
  seeAlso: ['inventario', 'compras'],
};

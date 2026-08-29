import type { GuideFlow } from '../types';

export const FLOW_ABRIR_CAJA: GuideFlow = {
  id: 'abrir-caja',
  area: 'caja',
  title: 'Abrir la caja del día',
  summary: 'Declarar con cuánto efectivo arranca el cajón. Es el primer acto del turno.',
  audience: ['caja'],
  icon: 'wallet',
  when: 'Antes de la primera venta. Sin turno abierto la caja no deja vender y te manda acá sola.',
  before: ['Contar la base que queda en el cajón.'],
  steps: [
    { do: 'Entra a Caja. Si no hay turno, la pantalla de apertura sale sola.' },
    {
      do: 'Cuenta el efectivo que hay en el cajón y escribe ese número.',
      why: 'Es el punto de partida del arqueo de esta noche. Si lo escribes de memoria y estaba mal, el descuadre del cierre no va a ser tuyo pero lo vas a tener que explicar.',
    },
    { do: 'Confirma.' },
  ],
  sightings: [
    {
      where: 'Caja → topbar',
      what: 'El badge "En caja" arranca con ese monto y sube con cada venta en efectivo.',
      means: 'Ese número es lo que deberías tener en el cajón en cualquier momento. Sirve para arquear a mitad de turno sin cerrar.',
    },
    {
      where: 'Caja → Caja',
      what: 'La apertura encabeza el informe del turno.',
    },
    {
      where: 'Gestión → Caja → Turnos',
      what: 'La fila del turno con su hora de apertura y quién lo abrió.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Una sola caja abierta en todo el negocio',
      text:
        'No hay una caja por persona: hay una por día del negocio. Si ya está abierta, quien llegue después sigue vendiendo sobre la misma. La cierra quien la abrió o un admin.',
    },
    {
      kind: 'warn',
      text:
        'Si quedó una caja abierta de un día anterior, el sistema bloquea las ventas hasta cerrarla. No es un capricho: dejar entrar ventas de hoy a la caja de ayer haría imposible cuadrar el arqueo de ayer.',
    },
    {
      kind: 'note',
      text:
        'Sin internet también se puede abrir: queda guardada en la tableta y se sincroniza sola al volver la conexión. Si la apertura fue ayer y el corte cruzó las 4 am, la caja nace vencida y te va a pedir el arqueo de ayer antes de operar.',
    },
  ],
  questions: [
    {
      q: 'Ya alguien abrió la caja y yo entro a la mitad del turno.',
      a: 'No abres otra: sigues vendiendo sobre la misma. La caja es del negocio, no de la persona. Al cerrar, el arqueo cubre todo el turno completo.',
    },
    {
      q: 'Me equivoqué en el monto de apertura.',
      a: 'Avísale al dueño: solo un admin puede reabrir una caja para corregirla. Si ya vendiste, es mejor dejarla y explicar la diferencia en la nota del cierre.',
    },
  ],
  seeAlso: ['caja-cierre'],
};

export const FLOW_MOVIMIENTO_EFECTIVO: GuideFlow = {
  id: 'movimiento-efectivo',
  area: 'caja',
  title: 'Registrar una entrada o salida de efectivo',
  summary: 'Anotar plata que entra o sale del cajón por algo que no es una venta.',
  audience: ['caja'],
  icon: 'arrow-left-right',
  when:
    'Le pagaste al domiciliario, saliste a comprar hielo, metiste un fondo de cambio, el dueño sacó plata. En el momento en que pasa: si lo dejas para el cierre, el arqueo va a marcar un faltante que nadie va a saber explicar.',
  before: ['Turno abierto.'],
  steps: [
    { do: 'Caja → Caja → baja hasta Movimientos.' },
    { do: 'Elige Entrada o Salida.' },
    {
      do: 'Elige el medio.',
      why: 'Efectivo cambia lo que esperas contar en el cajón. Transferencia no toca el cajón: ajusta el arqueo de ese medio digital.',
    },
    { do: 'Escribe el monto.' },
    {
      do: 'Escribe el motivo con nombre y apellido.',
      why: '"Pago del domiciliario de las 8 pm" se entiende dentro de un mes. "Varios" no le sirve a nadie, empezando por ti cuando el arqueo no cuadre.',
    },
  ],
  sightings: [
    {
      where: 'Caja → topbar',
      what: 'El badge "En caja" cambia al instante.',
    },
    {
      where: 'Caja → Caja → Cerrar turno',
      what: 'Entra al efectivo esperado: apertura + ventas en efectivo − domicilios + entradas − salidas.',
      means: 'Este es el punto: sin el movimiento, el esperado queda alto y el cierre marca faltante.',
    },
    {
      where: 'Caja → Arqueos → detalle del turno',
      what: 'La lista de movimientos con su motivo.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Caja',
      what: 'Entradas y salidas con quién las registró.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Los movimientos de caja se hacen SOLO acá',
      text:
        'Ningún módulo financiero escribe en la caja. Si el dueño paga la nómina o una factura desde Finanzas, eso sale del bolsillo del negocio, no de tu cajón. Si además sacó los billetes del cajón, alguien tiene que registrar la salida en esta pantalla a mano.',
    },
    {
      kind: 'note',
      text: 'Se pueden editar y borrar mientras la caja siga abierta. Una vez cerrada quedan inmutables, y todo cambio queda en la auditoría.',
    },
  ],
  questions: [
    {
      q: 'Le pagué al domiciliario con plata del cajón.',
      a: 'Salida, medio Efectivo, motivo "pago domiciliario pedido #N". Si no lo registras, esa plata se va a ver como faltante al cerrar.',
    },
    {
      q: 'El dueño sacó $200.000 del cajón.',
      a: 'Salida en efectivo con el motivo "retiro del dueño". Que él lo haya sacado no lo registra solo: la caja solo sabe lo que le cuentan.',
    },
    {
      q: 'Pagué un proveedor por transferencia desde la cuenta del negocio.',
      a: 'Salida con medio Transferencia. No toca el cajón, pero baja lo que esperas ver en esa cuenta al arquear.',
    },
  ],
  seeAlso: ['caja-cierre'],
};

export const FLOW_ANULAR_REEMBOLSAR: GuideFlow = {
  id: 'anular-o-reembolsar',
  area: 'caja',
  title: 'Anular o reembolsar una venta',
  summary: 'Deshacer un cobro. Cuál de las dos depende de si la comida se preparó.',
  audience: ['caja', 'dueno'],
  icon: 'undo',
  when: 'El cliente se arrepintió, cobraste dos veces, el pedido salió mal.',
  before: ['Turno abierto y el PIN de quien tenga permiso (admin o dueño).'],
  steps: [
    { do: 'Caja → Historial. Busca el pedido.' },
    {
      do: 'Decide cuál: Anular si la cocina NO empezó. Reembolsar si la comida ya se hizo.',
      why: 'No es lo mismo. Anular devuelve el inventario porque nada se consumió; reembolsar NO lo devuelve, porque los insumos se gastaron de verdad y esa pérdida tiene que aparecer.',
    },
    { do: 'Escribe el motivo, entre 5 y 200 caracteres.' },
    { do: 'Pide el PIN de 6 dígitos a quien tenga permiso y confirma.' },
  ],
  sightings: [
    {
      where: 'Caja → Historial',
      what: 'El pedido queda marcado, con su motivo a la vista.',
    },
    {
      where: 'Caja → Caja',
      what: 'El efectivo esperado baja si el pedido se había cobrado en efectivo.',
      means:
        'Si la caja de esa venta ya se cerró, la devolución se registra como salida de efectivo en la caja abierta actual. Sin caja abierta, el sistema lo bloquea.',
    },
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'Solo en anulación: renglones que devuelven lo consumido.',
      means: 'En un reembolso no vas a ver nada acá, y es correcto: la comida se hizo.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'La anulación desaparece de ingresos; el reembolso queda en su propia línea a costo.',
    },
    {
      where: 'Gestión → Reportes → Anomalías',
      what: 'La cantidad de anulaciones por persona, contra su propio histórico.',
      means: 'Anular es legítimo y necesario. Lo que la pantalla mira es si alguien anula mucho más de lo que esa misma persona anula normalmente.',
    },
  ],
  pitfalls: [
    {
      kind: 'warn',
      text:
        'Si el pedido ya había ido a cocina, se imprime automáticamente una comanda de anulación con el número gigante. No la ignores: es la única forma de que la cocina se entere de que pare.',
    },
    {
      kind: 'note',
      text: 'Solo se anula un pedido PAGADO que la cocina no inició. Si ya está en preparación, la opción es reembolsar.',
    },
  ],
  questions: [
    {
      q: 'Cobré dos veces el mismo pedido.',
      a: 'Anula el duplicado: la cocina no preparó dos, así que el inventario debe volver. El motivo es literalmente "cobro duplicado".',
    },
    {
      q: 'El plato salió mal y le devolví la plata.',
      a: 'Reembolso. La comida se preparó y se perdió: el inventario NO se devuelve y queda como pérdida a costo, que es la verdad de lo que pasó.',
    },
    {
      q: 'No tengo el PIN.',
      a: 'Tiene que teclearlo quien lo tenga, en el momento. Es el punto del control: un PIN escrito en un papel al lado de la caja no controla nada, y los intentos fallidos también quedan registrados.',
    },
  ],
  seeAlso: ['caja-vender', 'reglas'],
};

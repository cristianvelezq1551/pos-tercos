import type { GuideFlow } from '../types';

export const FLOW_USUARIOS: GuideFlow = {
  id: 'crear-usuario',
  area: 'personal',
  title: 'Crear un usuario y darle su PIN',
  summary: 'Dar acceso a alguien nuevo, con el rol y el permiso de autorizar que le corresponde.',
  audience: ['dueno'],
  icon: 'users',
  when: 'Entra alguien al equipo. Antes de su primer turno.',
  before: [],
  steps: [
    { do: 'Gestión → Personal → Usuarios → Nuevo usuario.' },
    { do: 'Nombre completo y correo.' },
    {
      do: 'Elige el rol. Define a qué pantallas entra.',
      why: 'Admin operativo para quien atiende la caja · Cocinero para la cocina · Dueño para gestión completa · Trabajador para alguien a quien se le paga pero no entra al sistema.',
    },
    { do: 'Asigna la contraseña inicial y pídele que la cambie.' },
    {
      do: 'Si va a poder autorizar anulaciones y reembolsos, asígnale un PIN de 6 dígitos.',
      why: 'Solo admin operativo y dueño pueden tenerlo. El PIN no sirve para entrar: sirve para autorizar.',
    },
  ],
  sightings: [
    {
      where: 'Gestión → Personal → Usuarios',
      what: 'La lista con su rol y si tiene PIN.',
    },
    {
      where: 'Gestión → Personal → Nómina',
      what: 'Aparece para marcarle días y pagarle, si tiene salario cargado.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Sesiones',
      what: 'Sus entradas y salidas del sistema.',
    },
    {
      where: 'Gestión → Reportes → Anomalías',
      what: 'Después de cinco turnos empieza a compararlo contra su propio histórico.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Una cuenta por persona',
      text:
        'Si dos cajeros comparten usuario, ni la bitácora ni el reporte de anomalías sirven para nada: no hay forma de saber quién hizo qué. Es el control más barato del sistema y el más fácil de arruinar.',
    },
    {
      kind: 'warn',
      text:
        'Cuando alguien se va, se da de baja con su fecha — no se borra. Sus ventas y turnos siguen siendo parte de la historia; borrarlo dejaría huecos en meses ya cerrados.',
    },
  ],
  questions: [
    {
      q: '¿Qué rol le doy a quien atiende la caja?',
      a: 'Admin operativo. El rol "Cajero" quedó del modelo viejo y ya no entra a ninguna pantalla.',
    },
    {
      q: 'Se le olvidó la contraseña.',
      a: 'Gestión → Personal → Usuarios → Restablecer contraseña. Le asignas una nueva y él la cambia al entrar.',
    },
  ],
  seeAlso: ['personal'],
};

export const FLOW_WEB_CLIENTE: GuideFlow = {
  id: 'configurar-web',
  area: 'personal',
  title: 'Configurar la web del cliente',
  summary: 'Horarios, domicilios, datos de pago y todo lo que ve el público.',
  audience: ['dueno'],
  icon: 'globe',
  when: 'Al montar la página y cada vez que cambie algo: horario nuevo, cuenta bancaria distinta, radio de domicilios.',
  before: [],
  steps: [
    { do: 'Gestión → Operación → Web del cliente.' },
    {
      do: 'Datos de pago: las cuentas a las que transfiere el cliente.',
      why:
        'El MISMO texto va a la página de seguimiento y al WhatsApp. Si dijeran cuentas distintas, el cliente no sabría a cuál transferir. El número va en su propia línea, sin negrita, para que se pueda copiar de un toque.',
    },
    { do: 'Contacto: teléfono, dirección, enlace del mapa.' },
    {
      do: 'Horarios: los días y horas, con excepciones por fecha.',
      why: 'Con el switch de horario activo, fuera de hora el pedido NO puede crecer: el cliente ve el menú pero no puede agregar ni pagar.',
    },
    { do: 'Domicilios: enciéndelos y define el radio en kilómetros.' },
    { do: 'Nosotros y redes, si quieres que aparezcan.' },
  ],
  sightings: [
    {
      where: 'tercos.co',
      what: 'Todo lo que configuraste, en vivo.',
    },
    {
      where: 'La pantalla de seguimiento del pedido',
      what: 'Los datos de pago que cargaste.',
    },
    {
      where: 'El WhatsApp de instrucciones de pago',
      what: 'Los mismos datos, con el número en su línea para copiarlo.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'El interruptor de pedidos web, para pausar sin tocar código.',
      means: 'Apagado, la página muestra un aviso y nadie puede pedir. Es el freno de emergencia.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'Cerrado significa que el pedido no crece',
      text:
        'Con el local cerrado el cliente lee el menú y los precios, y puede quitar del carrito. Lo que no puede es agregar ni pagar. El cartel dice "Cerrado", no "Agotado": el producto existe y mañana se vende igual.',
    },
    {
      kind: 'warn',
      text:
        'La dirección del cliente se verifica contra el radio de verdad: fuera de cobertura el pedido se rechaza. Se mide contra la DIRECCIÓN que eligió de la lista, no contra dónde está su teléfono.',
    },
  ],
  questions: [
    {
      q: 'Cambié de cuenta bancaria.',
      a: 'Actualiza los datos de pago acá y listo: cambia a la vez en la página y en los mensajes de WhatsApp. No hay que tocar nada más.',
    },
    {
      q: 'Quiero cerrar la tienda hoy sin cambiar el horario.',
      a: 'Usa el interruptor de pedidos web en Finanzas → Estado financiero. Lo apagas y lo vuelves a prender cuando quieras, sin tocar la configuración de horarios.',
    },
  ],
  seeAlso: ['pedidos-web', 'personal'],
};

export const FLOW_REVISAR_CONTROL: GuideFlow = {
  id: 'revisar-control',
  area: 'control',
  title: 'Revisar que todo esté en orden',
  summary: 'La rutina semanal del dueño: dónde mirar y qué significa cada señal.',
  audience: ['dueno'],
  icon: 'shield-check',
  when: 'Una vez por semana, y siempre que un descuadre pase de $5.000 (te llega un WhatsApp en el momento).',
  before: [],
  steps: [
    {
      do: 'Gestión → Caja → Turnos: mira los descuadres de la semana.',
      why: 'Un descuadre aislado y explicado en la nota es normal. Uno repetido, de la misma persona y del mismo tamaño, no lo es.',
    },
    {
      do: 'Gestión → Reportes → Anomalías: mira si alguien se salió de SU propio promedio.',
      why: 'Compara a cada persona contra su histórico personal, no contra los demás. Necesita cinco turnos para tener con qué comparar.',
    },
    { do: 'Gestión → Auditoría → Bitácora: filtra por Anulaciones, Cortesías, Cajón y Stock forzado.' },
    { do: 'Gestión → Inventario → Deudas: los negativos que quedaron sin resolver.' },
    { do: 'Gestión → Reportes → Uso y mermas: los porcentajes que suben mes a mes.' },
    { do: 'Gestión → Reportes → Reconciliación: sube el extracto del banco y cruza los pagos digitales.' },
  ],
  sightings: [
    {
      where: 'Gestión → Reportes → Anomalías',
      what: 'Marcas cuando una métrica se dispara respecto de lo normal en esa persona.',
      means:
        'Una marca NO es una acusación: es una señal de que vale la pena preguntar. Casi siempre hay una explicación operativa, y preguntar es más útil que sancionar.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Cajón',
      what: 'Cada apertura del cajón sin venta, con su motivo y su PIN.',
      means: 'Abrir el cajón sin vender es legítimo (dar cambio), pero es la acción que más se presta. Por eso pide PIN y queda registrada.',
    },
    {
      where: 'Gestión → Reportes → Reconciliación',
      what: 'Cruzado · Sin venta · Sin movimiento.',
      means:
        '"Sin venta" es lo que se revisa primero: entró plata al banco que el sistema no registró. "Sin movimiento" suele ser demora del banco.',
    },
    {
      where: 'Gestión → Auditoría → Auditoría completa',
      what: 'El registro crudo de todo, cuando la bitácora no alcanza.',
      means: 'No se puede modificar ni borrar: ni tú puedes. Un registro editable no probaría nada.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text:
        'El sistema te avisa solo de lo grande: descuadres de $5.000 o más, descuentos manuales, cortesías y errores del servidor llegan por WhatsApp. Esta rutina es para lo que no dispara alerta pero se acumula.',
    },
  ],
  questions: [
    {
      q: 'Me llegó una alerta de descuadre. ¿Qué hago?',
      a: 'Abre el turno en Gestión → Caja → Turnos y lee la nota del cierre. La mayoría de los descuadres tienen ahí su explicación. Si no la hay, la conversación con quien cerró es el siguiente paso — no la sanción.',
    },
    {
      q: 'Alguien anula muchas ventas.',
      a: 'Mira la bitácora filtrada por Anulaciones: cada una tiene motivo y hora. Si los motivos son razonables y hay pocas por turno, es operación normal. Un patrón —siempre al final del turno, siempre montos parecidos— sí merece conversación.',
    },
  ],
  seeAlso: ['reportes', 'reglas'],
};

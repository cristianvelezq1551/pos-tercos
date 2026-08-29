import type { GuideChapter } from './types';

export const SISTEMA: GuideChapter = {
  id: 'sistema',
  title: 'Cómo está armado el sistema',
  eyebrow: 'Empieza por acá',
  icon: 'map',
  summary: 'Las cinco pantallas del negocio, quién entra a cada una y las dos reglas de tiempo que explican casi todo.',
  intro:
    'Tercos no es una sola aplicación: son cinco pantallas distintas conectadas a la misma base de datos. Cada una está hecha para una persona y para un momento del día. Si entiendes cuál es cuál, el resto de la guía se lee solo.',
  sections: [
    {
      id: 'las-cinco-pantallas',
      title: 'Las cinco pantallas',
      audience: ['caja', 'cocina', 'dueno'],
      summary: 'Qué es cada una y quién la abre.',
      blocks: [
        {
          kind: 'table',
          head: ['Pantalla', 'Quién la usa', 'Para qué'],
          rows: [
            ['Caja', 'Admin operativo', 'Vender, cobrar, imprimir, cerrar el turno. Funciona sin internet.'],
            ['Gestión', 'Dueño y admin operativo', 'Catálogo, compras, inventario, finanzas, reportes. Es donde estás ahora.'],
            ['Cocina', 'Cocinero', 'Recetas, producción, merma, conteo, incidencias y checklist.'],
            ['Web del cliente', 'Cualquiera, sin clave', 'El menú público y los pedidos para recoger o a domicilio.'],
            ['Pantalla del local', 'Nadie — corre sola', 'Publicidad y música en el televisor del salón.'],
          ],
        },
        {
          kind: 'note',
          text: 'Caja y Gestión viven en la misma dirección web: cambias entre modos con el botón "Gestión" arriba a la derecha de la caja, y con "Caja" en el menú lateral de gestión.',
        },
      ],
    },
    {
      id: 'roles',
      title: 'Quién puede ver qué',
      audience: ['dueno'],
      where: 'Gestión → Personal → Usuarios',
      summary: 'Cinco roles. El rol define las pantallas, no hay permisos sueltos por función.',
      blocks: [
        {
          kind: 'table',
          head: ['Rol', 'Entra a', 'No puede'],
          rows: [
            ['Dueño', 'Gestión completa y Cocina', 'Operar la caja. Es a propósito: quien vende no es quien audita.'],
            ['Admin operativo', 'Caja, Cocina y la parte operativa de Gestión', 'Ver finanzas, reportes, nómina, auditoría ni costos de los insumos.'],
            ['Cocinero', 'Solo Cocina', 'Ver precios de compra, costos, ventas ni tocar la caja.'],
            ['Cajero', 'Nada — rol retirado', 'Quedó del modelo viejo. Quien atiende la caja hoy es admin operativo.'],
            ['Trabajador', 'Nada', 'Existe para la nómina: es alguien a quien se le paga, no alguien que entra al sistema.'],
          ],
        },
        {
          kind: 'rule',
          title: 'El cocinero nunca ve plata',
          text: 'Las pantallas de cocina muestran cantidades, nunca costos ni precios de compra. No es una decisión de pantalla: el servidor le borra los costos a la respuesta antes de enviarla. Aunque alguien abriera la pantalla equivocada, no habría nada que leer.',
        },
      ],
    },
    {
      id: 'entrar',
      title: 'Entrar y salir',
      audience: ['caja', 'cocina', 'dueno'],
      summary: 'Un correo y una contraseña. La sesión aguanta una semana.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Abre la dirección de la pantalla que te toca y escribe tu correo y contraseña.' },
            {
              do: 'Listo. No vuelvas a entrar cada día.',
              why: 'La sesión se renueva sola mientras la uses al menos una vez por semana. Si te pide la clave sin motivo, la tableta estuvo apagada más de siete días.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'Cada pantalla tiene su propia sesión. Entrar a Cocina no te saca de Caja: puedes tener las dos abiertas en el mismo equipo sin pisarse.',
        },
        {
          kind: 'warn',
          text: 'Cerrar sesión NO cierra el turno de la caja. Son cosas distintas: el turno se cierra desde Caja → Caja → Cerrar turno, contando la plata. Si cierras sesión con el turno abierto, la caja sigue abierta.',
        },
      ],
    },
    {
      id: 'dia-de-negocio',
      title: 'El día del negocio empieza a las 4 de la mañana',
      audience: ['caja', 'dueno'],
      summary: 'La operación de la caja corta a las 4 am, no a medianoche.',
      blocks: [
        {
          kind: 'prose',
          text: 'El local vende de madrugada. Si el día cortara a medianoche, un turno que empieza el viernes a las 5 pm se volvería "viejo" a la 1 am y la caja se trabaría en plena venta. Por eso el día operativo va de las 4:00 am a las 3:59 am del día siguiente.',
        },
        {
          kind: 'bullets',
          items: [
            'A la 1 de la mañana, el historial y el panel de pedidos siguen mostrando la noche que estás trabajando.',
            'Una caja abierta el jueves se puede operar hasta las 3:59 am del viernes. A las 4:00 am pasa a estar vencida y el sistema exige cerrarla antes de seguir vendiendo.',
            'Cerrar la caja de madrugada ya no consume el cupo del día siguiente: puedes abrir la del viernes normalmente desde las 4 am.',
          ],
        },
        {
          kind: 'rule',
          title: 'La contabilidad sí corta a medianoche',
          text: 'Lo vendido hasta las 11:59 pm pertenece a ese día en los reportes; lo cobrado a la 1 am cae al día siguiente. Por eso el reporte de un turno que cruzó medianoche no coincide con el reporte de ventas del día — el turno agrupa por caja, el reporte agrupa por fecha. No es un error: son dos preguntas distintas.',
        },
      ],
    },
    {
      id: 'sin-internet',
      title: 'Qué pasa si se cae el internet',
      audience: ['caja'],
      summary: 'La caja sigue vendiendo. Todo lo demás espera.',
      blocks: [
        {
          kind: 'prose',
          text: 'La caja está hecha para seguir funcionando sin conexión: abre turno, vende y cobra guardando todo en la tableta. Cuando vuelve el internet, sincroniza sola y aparece una bandeja con lo que se subió.',
        },
        {
          kind: 'bullets',
          items: [
            'Sin conexión se cobra solo en efectivo o transferencia, y con un método de pago por venta.',
            'Los descuentos manuales y la cuenta dividida se ocultan: no viajan en el envío offline.',
            'El número de pedido sale provisional (aparece con "OFF") hasta que sincroniza.',
            'La franja de arriba te avisa cuántas ventas están esperando subir.',
          ],
        },
        {
          kind: 'warn',
          text: 'No cierres el turno con ventas sin sincronizar. El sistema lo bloquea a propósito: el efectivo esperado estaría incompleto y el arqueo marcaría un faltante que no existe. Espera a que la bandeja quede en cero.',
        },
        {
          kind: 'note',
          text: 'Si una venta falla al subir cinco veces seguidas, deja de reintentar sola y queda en la bandeja para que alguien la revise. Nunca se pierde.',
        },
      ],
    },
  ],
};

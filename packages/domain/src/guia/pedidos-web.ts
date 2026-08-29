import type { GuideChapter } from './types';

export const PEDIDOS_WEB: GuideChapter = {
  id: 'pedidos-web',
  title: 'Pedidos por la web',
  eyebrow: 'Operación diaria',
  icon: 'globe',
  summary: 'Del clic del cliente al pedido entregado: pago, domicilio, avisos por WhatsApp y los interruptores que controlan la tienda.',
  intro:
    'El cliente arma su pedido en la página pública y transfiere. Nadie cobra automáticamente: alguien tiene que mirar el comprobante y confirmar. Ese paso manual es a propósito — es la diferencia entre un pedido pagado y uno que dice que pagó.',
  sections: [
    {
      id: 'como-llega',
      title: 'Cómo llega un pedido',
      audience: ['caja'],
      where: 'Caja → botón "Web" arriba a la derecha',
      summary: 'Aparece al instante con un contador y se abre el chat del cliente.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'El cliente arma su pedido en la página, elige recoger o domicilio y confirma.' },
            {
              do: 'Se le abre solo el chat de WhatsApp con el pedido escrito, y te llega a tu teléfono.',
              why: 'El mensaje entrante en tu celular es una señal más fuerte que un número en una pantalla. Además deja el hilo abierto para responderle.',
            },
            { do: 'En la caja, el botón "Web" muestra el contador de pedidos esperando.' },
          ],
        },
        {
          kind: 'note',
          text: 'El punto de color al lado del botón indica la conexión: verde es tiempo real, ámbar significa que se cayó y está consultando cada pocos segundos. En ámbar los pedidos siguen llegando, solo que con unos segundos de retraso.',
        },
      ],
    },
    {
      id: 'confirmar-pago',
      title: 'Confirmar el pago',
      audience: ['caja'],
      where: 'Caja → Web → Pend. pago',
      summary: 'El paso que convierte un pedido en una venta.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              do: 'Mira el comprobante que te mandó el cliente y verifica que el monto y la fecha coincidan.',
              why: 'Nadie más va a revisar esto. Confirmar sin mirar es regalar el pedido.',
            },
            { do: 'Abre el pedido en la lista y toca "Confirmar pago".' },
            { do: 'Elige el medio por el que entró la plata y confirma.' },
          ],
        },
        {
          kind: 'prose',
          text: 'Al confirmar, el pedido entra a tu caja como cualquier venta del mostrador: descuenta inventario, imprime la comanda y la factura, y suma al arqueo del turno.',
        },
        {
          kind: 'note',
          text: 'Si el cliente nunca pagó, usa "Rechazar". El inventario no se toca porque nunca se descontó, y al cliente le llega el aviso de cancelación.',
        },
        {
          kind: 'warn',
          text: 'Si un producto del pedido se agotó entre que el cliente lo pidió y tú confirmas, sale un aviso de faltante. Habla con el cliente antes de confirmar: cobrarle algo que no vas a poder entregar es peor que la llamada incómoda.',
        },
      ],
    },
    {
      id: 'domicilio',
      title: 'Cobrar el domicilio',
      audience: ['caja'],
      where: 'Caja → Web → tarjeta del pedido',
      summary: 'El envío se cotiza después, y con un toque se le avisa al cliente.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Abre el pedido a domicilio y escribe el costo del envío en su campo.' },
            {
              do: 'Toca "Cobrar por WhatsApp". Se guarda el envío y se abre el chat con el mensaje ya escrito.',
              why: 'Son una sola idea, no dos: el cliente necesita saber el total antes de transferir, y el total no existía hasta que cotizaste el envío.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'El mensaje muestra el desglose: total, cuánto es del pedido y cuánto del domicilio. Al cliente le acaba de subir el número que vio en la página, y ese es justo el dato que va a querer discutir.',
        },
        {
          kind: 'prose',
          text: 'Si cambias el envío después de haber avisado, el botón cambia a "Cambiar y reenviar" y manda el total corregido. El cliente tiene un número viejo en la mano: hay que decírselo.',
        },
      ],
    },
    {
      id: 'avisar',
      title: 'Avisarle al cliente',
      audience: ['caja'],
      summary: 'Los avisos salen de TU WhatsApp, no de un número del sistema.',
      blocks: [
        {
          kind: 'rule',
          title: 'El sistema escribe, la persona manda',
          text: 'Cada botón de WhatsApp abre el chat con el mensaje ya redactado. Tú tocas enviar. No hay envío automático: así el cliente te responde en el hilo de siempre en vez de escribirle a un número que nadie lee.',
        },
        {
          kind: 'table',
          head: ['Momento', 'Qué dice el mensaje'],
          rows: [
            ['Al crear el pedido (recoger)', 'Cómo pagar, con los datos de las cuentas.'],
            ['Al cotizar el envío (domicilio)', 'El total con el desglose y cómo pagar.'],
            ['Pago confirmado', 'Que ya está verificado y entró a preparación.'],
            ['Listo', 'Que puede venir a recogerlo, con la dirección; o que va en camino.'],
            ['Cancelado', 'Que el pedido no se completó.'],
          ],
        },
        {
          kind: 'note',
          text: 'La tarjeta te muestra cuáles avisos ya salieron. Si intentas repetir uno, te avisa antes: es para no mandarle tres veces lo mismo al cliente.',
        },
      ],
    },
    {
      id: 'cerrar-pedido',
      title: 'Cerrar el pedido',
      audience: ['caja'],
      where: 'Caja → Web',
      summary: 'Recoger termina en "listo". Domicilio termina en "entregado".',
      blocks: [
        {
          kind: 'table',
          head: ['Tipo', 'Recorrido'],
          rows: [
            ['Recoger', 'Pendiente de pago → Pagado → Listo para retirar. Ahí termina.'],
            ['Domicilio', 'Pendiente de pago → Pagado → Despachado (salió en la moto) → Entregado.'],
          ],
        },
        {
          kind: 'warn',
          text: 'Si nadie toca estos botones, los pedidos se quedan en "pagado" para siempre y se van amontonando en "Por preparar". Ningún domicilio llega a "entregado", así que no hay forma de medir cuánto tarda el reparto. El cliente no se entera, porque la página ya no promete ese avance — pero tú pierdes el dato.',
        },
      ],
    },
    {
      id: 'que-ve-el-cliente',
      title: 'Qué ve el cliente',
      audience: ['caja', 'dueno'],
      summary: 'Tres desenlaces, no ocho estados.',
      blocks: [
        {
          kind: 'table',
          head: ['Estado', 'Qué ve'],
          rows: [
            ['Esperando su pago', 'Cómo pagar y un botón de WhatsApp.'],
            ['Pago confirmado', 'Su número de pedido. Lo demás le llega por WhatsApp.'],
            ['Cancelado', 'Que no se completó.'],
          ],
        },
        {
          kind: 'rule',
          title: 'La página no cuenta el progreso',
          text: 'Antes había una barra de "Recibido → Preparando → Listo". Se quitó: el avance lo marca una persona a mano y en la práctica no siempre ocurre. Una barra que nunca avanza es peor que no tenerla, porque promete algo que no va a pasar. El canal de avance es WhatsApp.',
        },
      ],
    },
    {
      id: 'controles',
      title: 'Los interruptores de la tienda',
      audience: ['dueno'],
      where: 'Gestión → Operación → Web del cliente',
      summary: 'Horarios, domicilios, radio de cobertura y el freno de emergencia.',
      blocks: [
        {
          kind: 'table',
          head: ['Control', 'Qué hace'],
          rows: [
            ['Pedidos web', 'El freno de emergencia. Apagado, la página muestra un aviso y nadie puede pedir.'],
            ['Horarios', 'Los días y horas de atención, con excepciones por fecha. Fuera de horario el pedido no puede crecer.'],
            ['Domicilios', 'Enciende o apaga la opción de envío en el checkout.'],
            ['Radio de cobertura', 'Los kilómetros hasta donde se reparte, medidos en línea recta desde el local.'],
            ['Datos de pago', 'Las cuentas a las que transfiere el cliente. Se muestran en la página y en el WhatsApp.'],
            ['Contacto y redes', 'Teléfono, dirección y enlaces que ve el público.'],
          ],
        },
        {
          kind: 'rule',
          title: 'Cerrado significa que el pedido no crece',
          text: 'Con el local cerrado el cliente puede leer el menú y los precios, y puede quitar cosas del carrito. Lo que no puede es agregar ni ir a pagar. El cartel dice "Cerrado", no "Agotado": el producto existe y mañana se vende igual.',
        },
        {
          kind: 'warn',
          text: 'La dirección del cliente se verifica contra el radio de verdad: fuera de cobertura, el pedido se rechaza. Se mide contra la DIRECCIÓN que eligió de la lista, no contra dónde está su teléfono — quien pide desde el trabajo para su casa se mide desde la casa.',
        },
        {
          kind: 'note',
          text: 'Hay dos topes contra el abuso: máximo 3 pedidos sin pagar por teléfono al día, y un límite de pedidos por conexión. Los pedidos ya pagados no cuentan para el primero.',
        },
      ],
    },
  ],
};

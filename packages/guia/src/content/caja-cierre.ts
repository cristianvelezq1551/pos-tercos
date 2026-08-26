import type { GuideChapter } from './types';

export const CAJA_CIERRE: GuideChapter = {
  id: 'caja-cierre',
  title: 'Caja: cerrar el turno',
  eyebrow: 'Operación diaria',
  icon: 'wallet',
  summary: 'Contar el efectivo, arquear cada medio digital y entender de dónde sale el número esperado.',
  intro:
    'El cierre es el momento en que el sistema y la realidad se miran a los ojos. Todo lo que hiciste durante el turno desemboca acá, y el descuadre que aparezca no es un capricho del programa: es la diferencia entre lo que el sistema cree que debería haber y lo que hay de verdad.',
  sections: [
    {
      id: 'movimientos',
      title: 'Movimientos de efectivo',
      audience: ['caja'],
      where: 'Caja → Caja → Movimientos',
      summary: 'Plata que entra o sale del cajón por algo que no es una venta.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Ve a la pestaña Caja y baja hasta Movimientos.' },
            { do: 'Elige Entrada o Salida, el medio y el monto.' },
            { do: 'Escribe el motivo con nombre y apellido: "pago del proveedor de pan", no "varios".' },
          ],
        },
        {
          kind: 'prose',
          text: 'Un movimiento en efectivo cambia lo que esperas contar en el cajón. Un movimiento por transferencia no toca el cajón: ajusta el arqueo de ese medio digital.',
        },
        {
          kind: 'rule',
          title: 'Los movimientos de caja se hacen SOLO acá',
          text: 'Ningún módulo financiero escribe en la caja. Si el dueño paga la nómina o una factura desde Finanzas, eso sale del bolsillo del negocio, no de tu cajón. Si además sacó los billetes del cajón, alguien tiene que registrar la salida en esta pantalla a mano. Es la única forma de que el arqueo cuadre.',
        },
        {
          kind: 'note',
          text: 'Puedes editar o borrar movimientos mientras la caja siga abierta. Una vez cerrada, quedan inmutables y todo cambio queda en la auditoría.',
        },
      ],
    },
    {
      id: 'efectivo-esperado',
      title: 'De dónde sale el efectivo esperado',
      audience: ['caja', 'dueno'],
      summary: 'La fórmula completa, para que el descuadre nunca sea un misterio.',
      blocks: [
        {
          kind: 'prose',
          text: 'Efectivo esperado = base de apertura + ventas cobradas en efectivo − la parte de domicilio de esas ventas + entradas de efectivo − salidas de efectivo.',
        },
        {
          kind: 'rule',
          title: 'El domicilio no está en el cajón',
          text: 'Al domiciliario se le paga al entregar, siempre. Cuando cierras, esa plata ya salió. Por eso el esperado descuenta el cobro del envío de cualquier medio en el que haya entrado. Si el esperado lo incluyera, cada domicilio te marcaría un faltante que no existe.',
        },
        {
          kind: 'note',
          text: 'Las ventas anuladas y las cuentas sin cobrar no entran en el esperado. Las propinas tampoco: van en un bote aparte.',
        },
      ],
    },
    {
      id: 'cerrar',
      title: 'Cerrar el turno',
      audience: ['caja'],
      where: 'Caja → Caja → Cerrar turno',
      summary: 'Contar todo: el cajón y cada medio digital.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Toca "Cerrar turno". Se abre el informe del turno con todo lo vendido.' },
            {
              do: 'Cuenta el efectivo. Puedes escribir el total directo o activar el conteo por denominación.',
              why: 'El conteo por denominación suma solo y deja constancia de cuántos billetes de cada valor había. Con el conteo a ciegas, el esperado queda oculto hasta que terminas: así cuentas lo que hay, no lo que "debería" haber.',
            },
            {
              do: 'Arquea cada medio digital que tuvo movimiento: escribe cuánto dice la aplicación del banco.',
              why: 'Es obligatorio. El botón de cerrar sigue apagado hasta que no falte ninguno.',
            },
            { do: 'Si hubo propinas, escríbelas en su campo.' },
            { do: 'Deja una nota si algo pasó y cierra.' },
          ],
        },
        {
          kind: 'rule',
          title: 'Contar cero sí es arquear',
          text: 'Si un medio no tuvo ningún movimiento, escribe 0 y sigue. Dejar el campo vacío es lo que bloquea el cierre. La diferencia importa: cero es una afirmación, vacío es no haber mirado.',
        },
        {
          kind: 'warn',
          text: 'Un descuadre de $5.000 o más — en efectivo, en un medio digital, o entre los dos sumados — deja una alerta en la auditoría y le llega un WhatsApp al dueño en el momento. No es un castigo: es para que se revise el mismo día, mientras alguien todavía se acuerda de qué pasó.',
        },
      ],
    },
    {
      id: 'arqueos',
      title: 'Arqueos anteriores',
      audience: ['caja', 'dueno'],
      where: 'Caja → Arqueos',
      summary: 'El historial de cierres, con el detalle completo de cada uno.',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Apertura, ventas en efectivo, entradas y salidas, esperado, contado y descuadre.',
            'Lo cobrado por cada método, y la lista de ventas de cada uno.',
            'El arqueo digital: qué decía el banco contra qué esperaba el sistema.',
            'Las propinas del turno.',
          ],
        },
        {
          kind: 'note',
          text: 'En estas pantallas los domicilios ya están descontados de todos los totales. Los ves en un solo lugar: Finanzas → Estado financiero → Domicilios del mes.',
        },
      ],
    },
    {
      id: 'impresoras',
      title: 'Impresoras de esta terminal',
      audience: ['caja'],
      where: 'Caja → Config',
      summary: 'Qué imprime cada impresora. Se guarda en este equipo, no en la nube.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Ve a Config. Salen las impresoras que este equipo detecta.' },
            { do: 'Marca qué documento sale por cada una.' },
            { do: 'Guarda.' },
          ],
        },
        {
          kind: 'table',
          head: ['Documento', 'Qué lleva'],
          rows: [
            ['Comanda de cocina', 'Lo que hay que preparar, sin bebidas ni precios.'],
            ['Comanda completa', 'Todo el pedido, sin precios.'],
            ['Factura del cliente', 'El pedido con precios, totales y forma de pago.'],
          ],
        },
        {
          kind: 'warn',
          text: 'Esta configuración vive en ESTE equipo. Si cambias de tableta o de computador, hay que volver a hacerla. Si nadie asignó la comanda de cocina, las comandas no salen y nadie se entera hasta que falta un pedido.',
        },
      ],
    },
  ],
};

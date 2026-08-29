import type { GuideChapter } from './types';

export const COMPRAS: GuideChapter = {
  id: 'compras',
  title: 'Compras y proveedores',
  eyebrow: 'Configuración',
  icon: 'receipt',
  summary: 'Subir una factura con foto, dejar que la lea la inteligencia artificial, confirmarla y pedirle al proveedor.',
  intro:
    'Confirmar una factura es el único momento en que entra inventario al sistema, y también cuando se actualizan los costos de todo lo que compras. Es el paso más importante de la semana: si no se hace, los costos quedan viejos y los márgenes de los reportes dejan de servir.',
  sections: [
    {
      id: 'subir-factura',
      title: 'Subir una factura',
      audience: ['dueno'],
      where: 'Gestión → Compras → Facturas → Nueva',
      summary: 'Le tomas la foto y la inteligencia artificial la transcribe.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Toma la foto de la factura y súbela.' },
            {
              do: 'Espera unos segundos: la inteligencia artificial lee proveedor, número, ítems, cantidades, precios y total.',
              why: 'Transcribir a mano una factura de veinte renglones es donde se cometen los errores que después nadie encuentra.',
            },
            { do: 'Revisa la ventana de confirmación línea por línea.' },
          ],
        },
        {
          kind: 'note',
          text: 'Si la foto sale mal o el proveedor no da factura, hay una guía de carga manual con los mismos campos. Y si la factura es la de siempre, usa "Clonar" sobre una anterior ya confirmada: trae proveedor e ítems y solo escribes los montos.',
        },
      ],
    },
    {
      id: 'confirmar-factura',
      title: 'Confirmar la factura',
      audience: ['dueno'],
      where: 'Gestión → Compras → Facturas → detalle',
      summary: 'El paso que mueve inventario y actualiza costos.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              do: 'Asocia cada línea de la factura con el insumo o producto que le corresponde.',
              why: 'El sistema sugiere el más parecido por nombre, pero la decisión es tuya. Asociar mal significa sumarle stock al insumo equivocado.',
            },
            { do: 'Si algo que compraste no existe todavía en el catálogo, créalo ahí mismo con "Crear nuevo".' },
            {
              do: 'Si te cobraron por traerlo, escribe ese valor en "Domicilio o flete".',
              why: 'Va en su propio campo, no como una línea más: un domicilio no se almacena ni se cocina. La pantalla te muestra en vivo cuánto es mercancía y si cuadra con los ítems.',
            },
            { do: 'Verifica que el total y el IVA coincidan con el papel.' },
            { do: 'Registra si ya la pagaste, con qué bolsillo y sube el comprobante.' },
            { do: 'Confirma.' },
          ],
        },
        {
          kind: 'prose',
          text: 'Al confirmar pasan tres cosas: entra el inventario comprado, se actualiza el costo de cada insumo y se guarda cuánto te cobró ese proveedor por cada cosa.',
        },
        {
          kind: 'note',
          text: 'Si el domicilio no venía en el papel —le pagaste en efectivo al que trajo la mercancía— puedes agregarlo después: abre la factura y toca "Agregar domicilio". Es lo único de una factura confirmada que se puede corregir, porque el flete no mueve inventario. Si la factura ya estaba pagada, el sistema te va a preguntar de qué bolsillo salió esa plata: sin eso, el saldo de tesorería deja de cuadrar.',
        },
        {
          kind: 'rule',
          title: 'El domicilio no encarece ningún producto',
          text: 'Lo que cobra el proveedor por traer la mercancía se registra aparte y NO se reparte entre los insumos. Si se repartiera, encarecería productos al azar y el precio guardado del proveedor dejaría de ser el que te cobra. Aparece como una línea propia en el estado financiero y en su tarjeta "Domicilios de compra", donde ves cuánto pesa sobre lo que compras.',
        },
        {
          kind: 'rule',
          title: 'El precio de la factura no es el precio de venta',
          text: 'Lo que te cobró el proveedor actualiza el COSTO. El precio al que le vendes al cliente no se toca nunca desde acá. Son dos números distintos y confundirlos borra el margen.',
        },
        {
          kind: 'warn',
          text: 'Confirmar una factura de una compra vieja también corrige hacia atrás: si vendiste algo cuyo insumo no estaba cargado, el sistema había estimado ese costo y deja una deuda pendiente. La factura la salda con el costo real. Por eso vale la pena subirlas aunque sean de hace semanas.',
        },
      ],
    },
    {
      id: 'pagar-factura',
      title: 'Marcar una factura como pagada',
      audience: ['dueno'],
      where: 'Gestión → Compras → Facturas → detalle',
      summary: 'Con comprobante y con el bolsillo del que salió.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Abre la factura y toca "Marcar pagada".' },
            { do: 'Indica de qué bolsillo salió: efectivo, cuenta o repartido entre los dos.' },
            { do: 'Sube el comprobante.' },
          ],
        },
        {
          kind: 'note',
          text: 'Una factura sin pagar aparece como compromiso pendiente en Finanzas. Una pagada descuenta del bolsillo correspondiente en tesorería.',
        },
        {
          kind: 'warn',
          text: 'Pagar una factura NO toca el cajón de la caja. Si sacaste los billetes del cajón, alguien tiene que registrar la salida de efectivo desde la caja a mano, o el arqueo de ese turno va a marcar faltante.',
        },
      ],
    },
    {
      id: 'proveedores',
      title: 'Proveedores',
      audience: ['dueno'],
      where: 'Gestión → Compras → Proveedores',
      summary: 'Los datos de contacto y el histórico de lo que te ha vendido cada uno.',
      blocks: [
        {
          kind: 'prose',
          text: 'La ficha de cada proveedor muestra qué productos te ha vendido, a qué precio la última vez y sus facturas recientes. Sirve para ver si te subieron el precio antes de volver a pedir.',
        },
        {
          kind: 'note',
          text: 'Sin teléfono cargado no se le puede armar el pedido por WhatsApp. Vale la pena completarlo.',
        },
      ],
    },
    {
      id: 'compras-domicilios',
      title: 'Cuánto gastas en domicilios de compra',
      audience: ['dueno'],
      where: 'Gestión → Reportes → Compras y domicilios',
      summary: 'Semana por semana y proveedor por proveedor.',
      blocks: [
        {
          kind: 'prose',
          text: 'Es el único lugar donde el domicilio se compara contra lo que compraste. El monto solo no dice nada: $300.000 de fletes es barato sobre $8 millones de compra y caro sobre $2. El porcentaje sí.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Elige el rango y si quieres verlo por semana o por mes.' },
            {
              do: 'Mira la tabla por proveedor: está ordenada por el que más cobró.',
              why: 'Esa fila de arriba es la conversación que más plata devuelve. Ordenar por volumen de compra pondría primero al más grande, que puede ser justo el que no cobra domicilio.',
            },
            { do: 'Si alguno pasa del 5%, hablalo: envío gratis sobre un mínimo, o juntar pedidos para que vengan menos veces.' },
          ],
        },
        {
          kind: 'note',
          text: 'Las semanas sin compras aparecen igual, en cero. Saltearlas haría leer la serie como si fueran semanas seguidas cuando hay un hueco en el medio.',
        },
        {
          kind: 'warn',
          text: 'Los cortes por semana usan la fecha en que REGISTRASTE la factura, no la que está impresa en el papel. Si subes el lunes las facturas de la semana pasada, todo ese domicilio cuenta como de esta semana. Súbelas el día que llega la mercancía.',
        },
      ],
    },
    {
      id: 'sugerencias',
      title: 'Sugerencias inteligentes',
      audience: ['dueno'],
      where: 'Gestión → Compras → Sugerencias inteligentes',
      summary: 'El sistema detecta qué está por acabarse y propone cuánto pedir.',
      blocks: [
        {
          kind: 'prose',
          text: 'Cada hora el sistema revisa qué insumos están por debajo de su mínimo y crea una sugerencia con la cantidad que haría falta, en unidad de COMPRA. Si algo se repuso solo, la sugerencia se marca como vencida.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Revisa la lista de sugerencias abiertas.' },
            {
              do: 'Si quieres una segunda opinión, toca "Evaluar con IA".',
              why: 'La inteligencia artificial mira tu histórico de compras de ese insumo y te dice si la cantidad tiene sentido o si conviene otra cosa. Cuesta centavos y solo corre cuando tú lo pides.',
            },
            { do: 'Acepta o rechaza, con una nota si hace falta.' },
          ],
        },
        {
          kind: 'note',
          text: 'Los subproductos no aparecen acá: se producen, no se compran.',
        },
      ],
    },
    {
      id: 'pedir-proveedor',
      title: 'Pedirle al proveedor',
      audience: ['dueno'],
      where: 'Gestión → Compras → Sugerencias → Pedir',
      summary: 'El sistema escribe el mensaje; tú lo mandas desde tu WhatsApp.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Elige el proveedor. La lista muestra a cuánto te vendió cada uno la última vez.' },
            { do: 'Ajusta la cantidad y el día en que lo necesitas.' },
            { do: 'Revisa la vista previa del mensaje.' },
            { do: 'Toca "Abrir WhatsApp" y envía.' },
          ],
        },
        {
          kind: 'rule',
          title: 'El mensaje nunca habla de precios',
          text: 'Ni el último que te cobró, ni un estimado, ni "cotízanos". Lo que cobra se negocia en el chat: sacar a relucir el precio viejo ancla la conversación en el peor lugar. Tú sí ves el último precio en la pantalla — es información interna y no viaja en el mensaje.',
        },
        {
          kind: 'prose',
          text: 'El mensaje lleva el saludo al proveedor por su nombre, de parte de qué negocio, los ítems con cantidad en unidad de compra, para cuándo lo necesitas, la dirección de entrega y un teléfono de contacto.',
        },
        {
          kind: 'note',
          text: 'La sugerencia se marca como aceptada al abrir el chat. El sistema no puede saber si tocaste enviar, y perseguirlo no vale la pena: siempre puedes rechazarla o volver a pedir.',
        },
      ],
    },
  ],
};

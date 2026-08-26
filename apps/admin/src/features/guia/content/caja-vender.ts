import type { GuideChapter } from './types';

export const CAJA_VENDER: GuideChapter = {
  id: 'caja-vender',
  title: 'Caja: vender y cobrar',
  eyebrow: 'Operación diaria',
  icon: 'shopping-cart',
  summary: 'Abrir el turno, armar el pedido, cobrar de todas las formas posibles y corregir lo que salió mal.',
  intro:
    'Todo lo que pasa en el mostrador vive acá. La caja está pensada para que el pedido normal se cobre en pocos toques, y para que los casos raros (cuenta dividida, descuento, cliente que se arrepiente) tengan un camino claro en vez de un arreglo a mano.',
  sections: [
    {
      id: 'abrir-turno',
      title: 'Abrir el turno',
      audience: ['caja'],
      where: 'Caja → se abre sola si no hay turno',
      summary: 'Sin turno abierto no se puede vender. Es lo primero del día.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Entra a Caja. Si no hay turno abierto, la pantalla de apertura sale sola.' },
            {
              do: 'Escribe con cuánto efectivo arranca el cajón (la base) y confirma.',
              why: 'Ese número es el punto de partida del arqueo. Si lo escribes mal, al cierre vas a ver un descuadre que no existe.',
            },
          ],
        },
        {
          kind: 'rule',
          title: 'Una sola caja abierta en todo el negocio',
          text: 'No hay una caja por persona: hay una caja por día del negocio. Si ya está abierta, quien llegue después sigue vendiendo sobre la misma. La cierra quien la abrió o un admin.',
        },
        {
          kind: 'warn',
          text: 'Si quedó una caja abierta de un día anterior, el sistema bloquea las ventas hasta cerrarla. No es un capricho: si dejaras entrar ventas de hoy a la caja de ayer, el arqueo de ayer nunca podría cuadrarse.',
        },
      ],
    },
    {
      id: 'armar-pedido',
      title: 'Armar el pedido',
      audience: ['caja'],
      where: 'Caja → Vender',
      summary: 'La pantalla se divide en tres: pedidos abiertos, catálogo y carrito.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Toca el producto en el catálogo del centro. Si tiene variantes o extras, se abre una ventana para elegirlos.' },
            {
              do: 'Ajusta cantidades con + y − en el carrito de la derecha.',
              why: 'Dos líneas del mismo producto con las mismas opciones se juntan solas en una. Si necesitas separarlas, cámbiale algo a una.',
            },
            { do: 'Escribe el nombre del cliente arriba del carrito si te lo pidieron o si vas a dejar la cuenta abierta.' },
            { do: 'Toca Cobrar.' },
          ],
        },
        {
          kind: 'note',
          text: 'Los productos agotados salen marcados y no se pueden agregar. Un producto preparado se marca agotado solo cuando le falta algún insumo o subproducto de su receta, así que el cartel te está diciendo algo real de la cocina.',
        },
      ],
    },
    {
      id: 'cobrar',
      title: 'Cobrar',
      audience: ['caja'],
      where: 'Caja → Vender → Cobrar',
      summary: 'Un solo botón hace todo: registra la venta, descuenta el inventario, manda la comanda e imprime.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Elige el método de pago.' },
            {
              do: 'Si es efectivo, escribe cuánto te dio el cliente. El vuelto aparece solo.',
              why: 'El sistema no te deja confirmar con menos de lo que vale el pedido.',
            },
            {
              do: 'Si es transferencia o similar, marca la casilla de comprobante verificado.',
              why: 'Es la única barrera contra cobrar un pedido que nunca se pagó. Marcarla sin mirar el comprobante es exactamente el fraude que existe para evitar.',
            },
            { do: 'Confirma.' },
          ],
        },
        {
          kind: 'prose',
          text: 'Al confirmar pasan cuatro cosas en orden: se crea la venta con su número de pedido, se descuenta el inventario, sale la comanda hacia la impresora de cocina y se imprime la factura del cliente.',
        },
        {
          kind: 'note',
          text: 'La venta se crea al CONFIRMAR, no al abrir la ventana de cobro. Si cierras la ventana sin pagar, no queda nada registrado.',
        },
        {
          kind: 'warn',
          text: 'Si la comanda no logra imprimirse, aparece un aviso rojo que no se va solo, con un botón para reintentar. La plata ya entró pero la cocina no vio el pedido: no ignores ese aviso.',
        },
      ],
    },
    {
      id: 'cuenta-dividida',
      title: 'Cuenta dividida',
      audience: ['caja'],
      where: 'Caja → Vender → Cobrar → Dividir cuenta',
      summary: 'Una cuenta pagada entre 2 y 10 personas, cada una con su método.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'En la ventana de cobro, toca "Dividir cuenta".' },
            { do: 'Elige cómo repartir.' },
            {
              do: 'Cobra cada parte: método, efectivo recibido o comprobante verificado.',
              why: 'El botón de confirmar sigue apagado hasta que todas las partes estén cobradas y sumen exactamente el total.',
            },
          ],
        },
        {
          kind: 'table',
          head: ['Modo', 'Cuándo usarlo'],
          rows: [
            ['Partes iguales', 'Cuatro amigos que pagan lo mismo. Si el total no se divide exacto, los pesos sobrantes se cargan a las primeras partes.'],
            ['Por productos', 'Cada quien paga lo suyo. Asignas unidad por unidad; los descuentos por promoción se reparten proporcionalmente.'],
            ['Montos libres', 'Uno pone una cifra y el resto se reparte. La última parte se autocompleta con lo que falte.'],
          ],
        },
        {
          kind: 'rule',
          title: 'Todo o nada',
          text: 'No existe el estado "medio pagado". La división se arma completa en la pantalla y se confirma de un solo golpe. Si algo falla, no se cobró nada.',
        },
        {
          kind: 'note',
          text: 'No aparece sin internet, y el modo "por productos" se apaga si pusiste un descuento sobre el total del pedido.',
        },
      ],
    },
    {
      id: 'descuentos',
      title: 'Descuento manual',
      audience: ['caja'],
      where: 'Caja → Vender → botón "Desc." en el carrito',
      summary: 'Bajarle el precio a una línea o a todo el pedido, con motivo obligatorio.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Toca "Desc." en la fila de arriba del carrito.' },
            { do: 'Elige si el descuento va sobre el total o sobre productos concretos, y si es en pesos o en porcentaje.' },
            {
              do: 'Escribe el motivo. Es obligatorio.',
              why: 'Un descuento sin motivo es indistinguible de plata que se perdió. El motivo queda en la auditoría y el dueño recibe un aviso por WhatsApp al instante.',
            },
          ],
        },
        {
          kind: 'rule',
          title: 'Descuento manual y promoción no conviven',
          text: 'Apenas pones un descuento a mano, las promociones se apagan para TODO el pedido. Es a propósito: si se sumaran, nadie podría explicar de dónde salió el precio final. Si la promoción es mejor que tu descuento, quita el descuento.',
        },
        {
          kind: 'note',
          text: 'No hay PIN ni aprobación previa. La barrera es que queda escrito y con nombre.',
        },
      ],
    },
    {
      id: 'cuentas-abiertas',
      title: 'Cuentas abiertas',
      audience: ['caja'],
      where: 'Caja → Vender → botón "Cuenta" y panel izquierdo',
      summary: 'El cliente que sigue pidiendo y paga al final.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Arma el primer pedido y escribe el nombre del cliente (obligatorio para abrir cuenta).' },
            { do: 'Toca "Cuenta" en vez de "Cobrar". La comanda sale a cocina y el carrito queda libre.' },
            { do: 'Para agregarle más: búscala en el panel izquierdo y usa "Agregar".' },
            {
              do: 'Toca "A cocina" para mandar lo nuevo.',
              why: 'Solo se imprime lo que todavía no se envió. La segunda tanda sale rotulada como ADICIÓN, para que la cocina no vuelva a preparar lo de antes.',
            },
            { do: 'Al final, "Cobrar" desde el mismo panel.' },
          ],
        },
        {
          kind: 'note',
          text: 'Las cuentas abiertas no se cancelan solas. Los cobros a medio hacer que quedan abandonados sí: el sistema los limpia a la media hora.',
        },
        {
          kind: 'warn',
          text: 'No puedes cerrar el turno con cuentas abiertas sin resolver. Al cerrar, la pantalla te obliga a cobrarlas, traspasarlas al turno siguiente o cancelarlas. Antes de esta regla, esas cuentas quedaban colgando de una caja muerta y ensuciaban el reporte.',
        },
      ],
    },
    {
      id: 'historial',
      title: 'Historial del día',
      audience: ['caja'],
      where: 'Caja → Historial',
      summary: 'Todo lo que pasó por la caja hoy, incluidas las cortesías.',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Filtras por estado: pendientes de pago, pagados, listos, anulados o todos.',
            'Tocas cualquier fila para ver el detalle del pedido.',
            'Las cortesías aparecen mezcladas en orden de hora, con el valor tachado y la etiqueta "regalado · no se cobró".',
            'Se actualiza sola cuando cobras, anulas o editas desde otra pantalla.',
          ],
        },
        {
          kind: 'note',
          text: 'El historial no filtra por quién atendió: muestra el día completo del negocio. Si entraste a la 1 am, sigues viendo la noche que estás trabajando.',
        },
      ],
    },
    {
      id: 'editar',
      title: 'Editar un pedido ya cobrado',
      audience: ['caja'],
      where: 'Caja → Historial → Editar',
      summary: 'Cambiar productos o corregir el método de pago sin anular.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Busca el pedido en el historial y toca "Editar".' },
            { do: 'Agrega o quita lo que corresponda.' },
            {
              do: 'Guarda. Se reimprime la comanda con el cambio.',
              why: 'El inventario se ajusta solo por la diferencia, no se recalcula desde cero.',
            },
          ],
        },
        {
          kind: 'rule',
          title: 'Lo que ya está en la plancha no se toca',
          text: 'Si el pedido salió de "pagado" y la cocina lo tomó, las líneas de preparación quedan bloqueadas: solo puedes cambiar bebidas y productos de reventa. Editar comida que ya se está cocinando genera desperdicio real.',
        },
        {
          kind: 'prose',
          text: 'El botón "Pago" al lado corrige el método sin tocar los productos: sirve cuando cobraste efectivo y en realidad fue transferencia. Es la forma correcta de arreglar un descuadre antes del cierre.',
        },
        {
          kind: 'note',
          text: 'Editar y cambiar el pago solo funcionan con la caja abierta. Una caja cerrada es inmutable.',
        },
      ],
    },
    {
      id: 'anular-reembolso',
      title: 'Anular y reembolsar',
      audience: ['caja'],
      where: 'Caja → Historial',
      summary: 'Dos cosas distintas. La diferencia es si la comida se preparó.',
      blocks: [
        {
          kind: 'table',
          head: ['', 'Anular', 'Reembolsar'],
          rows: [
            ['Cuándo', 'El pedido está pagado y la cocina no lo empezó.', 'La comida ya se hizo y se le devuelve la plata al cliente.'],
            ['Inventario', 'Se devuelve. Nada se consumió.', 'NO se devuelve. Los insumos se gastaron de verdad.'],
            ['En el resultado del mes', 'Desaparece, como si no hubiera existido.', 'Queda como pérdida, a costo, en su propia línea.'],
            ['Requisitos', 'Motivo de 5 a 200 caracteres y PIN de admin o dueño.', 'Lo mismo.'],
          ],
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Entra al pedido desde el historial y elige "Anular" o "Reembolsar".' },
            { do: 'Escribe el motivo con detalle.' },
            { do: 'Pide el PIN de 6 dígitos a quien tenga permiso.' },
          ],
        },
        {
          kind: 'warn',
          text: 'Si el pedido ya se había mandado a cocina, se imprime automáticamente una comanda de anulación con el número gigante. No la ignores: es la única forma de que la cocina se entere de que pare.',
        },
      ],
    },
    {
      id: 'cortesias',
      title: 'Cortesías',
      audience: ['caja', 'dueno'],
      where: 'Caja → Historial · Gestión → Operación → Solicitudes',
      summary: 'Regalar un producto. Queda registrado a costo real, no en cero.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Desde la caja, registra la cortesía indicando qué se regaló y por qué.' },
            {
              do: 'Listo, es inmediata. No espera aprobación.',
              why: 'El producto ya se entregó: pedir permiso después no cambia nada. El control es que el dueño recibe el aviso al instante, con tu nombre y el costo.',
            },
          ],
        },
        {
          kind: 'rule',
          title: 'Lo regalado nunca cuesta cero',
          text: 'La cortesía descuenta el inventario y se valora al costo real de los insumos que se fueron. Si algún insumo no tenía compra registrada, se estima con el último precio conocido y queda marcado como "aproximado" hasta que llegue la factura que lo confirme. Nunca se asume en cero: eso escondería la pérdida.',
        },
        {
          kind: 'prose',
          text: 'El dueño las ve todas en Gestión → Solicitudes, con el total del mes y el detalle de quién dio cada una. Desde ahí también puede anular una cortesía mal registrada, y eso devuelve el inventario con su costo original.',
        },
      ],
    },
  ],
};

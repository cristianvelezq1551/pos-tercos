import type { GuideChapter } from './types';

export const INVENTARIO: GuideChapter = {
  id: 'inventario',
  title: 'Inventario',
  eyebrow: 'Control',
  icon: 'box',
  summary: 'Existencias, el libro de movimientos que no se puede borrar, las deudas y el conteo físico.',
  intro:
    'El inventario del sistema es un libro contable, no una lista de cantidades. Nada se edita y nada se borra: cada entrada y cada salida queda como un renglón permanente. Eso hace que siempre se pueda explicar por qué hay lo que hay.',
  sections: [
    {
      id: 'existencias',
      title: 'Existencias',
      audience: ['dueno'],
      where: 'Gestión → Inventario → Existencias',
      summary: 'Todo lo que tiene stock, en una sola tabla.',
      blocks: [
        {
          kind: 'prose',
          text: 'La tabla junta insumos, subproductos y productos de reventa. Cada fila muestra cuánto hay, cuál es el mínimo y si está por debajo. Si el insumo tiene tamaño de porción configurado, también ves cuántas porciones te quedan — que suele ser la pregunta real.',
        },
      ],
    },
    {
      id: 'movimientos',
      title: 'Movimientos',
      audience: ['dueno'],
      where: 'Gestión → Inventario → Movimientos',
      summary: 'El libro completo: cada entrada y salida, con su origen.',
      blocks: [
        {
          kind: 'table',
          head: ['Tipo', 'De dónde sale'],
          rows: [
            ['Compra', 'De confirmar una factura.'],
            ['Venta', 'De cobrar un pedido.'],
            ['Producción', 'De registrar una tanda: suma el subproducto, resta sus insumos.'],
            ['Merma', 'De registrar algo dañado o perdido.'],
            ['Ajuste manual', 'De un conteo físico o una corrección.'],
            ['Inicial', 'De la carga del primer día.'],
          ],
        },
        {
          kind: 'rule',
          title: 'Nada se edita, nada se borra',
          text: 'La base de datos rechaza cualquier intento de modificar o eliminar un movimiento. No es una regla de la pantalla: está en el motor de la base. Un error se corrige con un movimiento nuevo que lo compensa, y quedan los dos a la vista. Así el inventario siempre se puede auditar hacia atrás.',
        },
      ],
    },
    {
      id: 'anular-merma',
      title: 'Anular una merma',
      audience: ['dueno'],
      where: 'Gestión → Inventario → Movimientos → Anular',
      summary: 'La única forma de corregir una merma mal registrada.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Busca el movimiento de merma en la lista.' },
            { do: 'Toca "Anular" y escribe el motivo.' },
            {
              do: 'Confirma. Se devuelven las unidades con su costo original.',
              why: 'No basta con devolver la cantidad: si no se devolviera también el costo, la pérdida seguiría restando del resultado del mes para siempre.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'Puedes anular de a poco: si mermaste 10 kg y solo se perdió 1, devuelves 9. Nunca más de lo que se mermó. El botón desaparece cuando ya se devolvió todo.',
        },
        {
          kind: 'warn',
          text: 'El resultado del mes tarda hasta un minuto en reflejar el cambio. Es normal: los cálculos de costo se guardan un rato para no rehacerlos en cada consulta.',
        },
      ],
    },
    {
      id: 'deudas',
      title: 'Deudas de inventario',
      audience: ['dueno'],
      where: 'Gestión → Inventario → Deudas',
      summary: 'Insumos en negativo: existen físicamente pero les falta el respaldo en el sistema.',
      blocks: [
        {
          kind: 'prose',
          text: 'Un insumo en negativo casi nunca es un error de la caja. Significa que se vendió o se consumió más de lo que estaba cargado: normalmente porque falta subir una factura de compra.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Revisa la lista y busca la factura que falta.' },
            {
              do: 'Súbela y confírmala.',
              why: 'Al entrar la compra, el sistema salda la deuda solo y corrige el costo estimado por el costo real.',
            },
            { do: 'Si de verdad no hay factura, corrige con un conteo físico.' },
          ],
        },
        {
          kind: 'note',
          text: 'Los consumibles aparecen en una lista aparte: viven en negativo por diseño y no piden acción.',
        },
      ],
    },
    {
      id: 'conteo',
      title: 'Conteo físico',
      audience: ['dueno', 'cocina'],
      where: 'Gestión → Inventario → Conteo físico',
      summary: 'Cuadrar el sistema con la realidad.',
      blocks: [
        {
          kind: 'prose',
          text: 'El conteo se hace a ciegas: quien cuenta no ve cuánto debería haber. Escribe lo que hay de verdad y el sistema registra el ajuste por la diferencia. Desde gestión ves qué se contó, qué se esperaba y de cuánto fue la diferencia.',
        },
        {
          kind: 'note',
          text: 'El cocinero cuenta desde su app. El dueño puede armar tareas de conteo para que la cocina las resuelva.',
        },
      ],
    },
    {
      id: 'ajustes',
      title: 'Ajustes manuales',
      audience: ['dueno'],
      where: 'Gestión → Inventario → Existencias → Ajustar',
      summary: 'Para la carga inicial y las correcciones puntuales.',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Inicial: la carga del primer día, cuando arrancas el sistema.',
            'Ajuste manual: una corrección con motivo.',
            'Merma: algo que se perdió.',
          ],
        },
        {
          kind: 'warn',
          text: 'Un ajuste manual no deja rastro de POR QUÉ el número estaba mal, solo de que alguien lo cambió. Si la causa es una compra sin cargar, sube la factura: además de arreglar la cantidad, arregla el costo.',
        },
      ],
    },
  ],
};

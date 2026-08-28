import type { GuideFlow } from '../types';

export const FLOW_MERMA: GuideFlow = {
  id: 'registrar-merma',
  title: 'Registrar una merma',
  summary: 'Sacar del inventario algo que se dañó, se quemó o se cayó, y que quede valorado a costo.',
  audience: ['cocina', 'dueno'],
  icon: 'trash',
  when:
    'Apenas pasa. Un insumo llegó en mal estado, se pasó de fecha, se quemó una tanda o se cayó al piso. No al final del turno "cuando haya tiempo": entre que pasa y que se registra, el sistema cree que ese producto está disponible y la caja lo sigue vendiendo.',
  before: [
    'El insumo o subproducto tiene que existir en el catálogo.',
    'Necesitas el celular con cámara: la foto es obligatoria.',
  ],
  steps: [
    { do: 'Entra a Cocina → Inventario y quédate en la pestaña Stock.' },
    { do: 'Busca el insumo por nombre en el buscador de arriba.' },
    { do: 'Toca el botón "Merma" de esa fila.' },
    {
      do: 'Escribe la cantidad que se perdió, en la unidad que muestra la pantalla.',
      why: 'Ojo con la unidad: si el pollo se mide en gramos, "2" son dos GRAMOS, no dos kilos. La pantalla te dice cuál es al lado del campo.',
    },
    {
      do: 'Escribe el motivo con palabras normales: "llegó podrido", "se quemó la tanda", "se cayó".',
      why: 'Ese texto es lo que va a leer el dueño. "Merma" o "daño" no le dicen nada; "el repollo llegó con hongo" le dice que hable con el proveedor.',
    },
    {
      do: 'Toma la foto de lo que se está botando. Sin foto no deja guardar.',
      why: 'La merma es la única pérdida que nadie más ve: no hay cliente, no hay factura, no hay recibo. La foto es lo que la separa de "desapareció y alguien escribió merma".',
    },
    { do: 'Guarda. El stock baja en el momento.' },
  ],
  sightings: [
    {
      where: 'Cocina → Inventario → Stock',
      what: 'El insumo aparece con menos cantidad, de inmediato.',
      means:
        'Si queda por debajo del mínimo, sale el aviso ámbar "Bajo". Si queda por debajo de CERO, sale rojo "Sin cuadrar": eso ya no es que falte poco, es que falta cargar una compra.',
    },
    {
      where: 'Gestión → Inventario → Movimientos',
      what: 'Un renglón de tipo "Merma" con la cantidad en negativo, tu nombre, la hora y el motivo.',
      means:
        'Ese renglón NO se puede editar ni borrar nunca. Si te equivocaste, se corrige con "Anular" y quedan los dos a la vista.',
    },
    {
      where: 'Gestión → Cocina → pestaña Merma',
      what: 'La lista de mermas del período con su foto, quién la registró y cuánto costó.',
      means: 'Es la vista del dueño para revisar si las pérdidas tienen patrón: mismo insumo, mismo día, mismo proveedor.',
    },
    {
      where: 'Gestión → Reportes → Uso y mermas',
      what: 'Por cada insumo: cuánto se consumió vendiendo, cuánto se mermó, el porcentaje de merma y los pesos perdidos.',
      means:
        'El porcentaje es el número que importa. Uno alto y estable puede ser normal (el pollo pierde peso al limpiarlo); uno que SUBE mes a mes casi siempre es un problema de proceso o de proveedor.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'La línea "− Merma (insumo/producto tirado, a costo)" restando del resultado del mes.',
      means:
        'Vale el costo real de lo que se fue, no el precio de venta. Si dice "aproximado", es que falta la factura de compra de ese insumo y el costo se estimó con el último precio conocido.',
      delay: 'Hasta un minuto: el cálculo de costos se guarda un rato para no rehacerlo en cada consulta.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Cocina',
      what: 'El registro de quién la hizo y cuándo.',
    },
  ],
  pitfalls: [
    {
      kind: 'warn',
      text:
        'La cantidad va en unidad de RECETA, no de compra. Si el pollo se receta en gramos y escribes "2" pensando en 2 kg, registraste 2 gramos: la pérdida real queda sin contar y el inventario sigue diciendo que hay pollo que ya no existe.',
    },
    {
      kind: 'rule',
      title: 'Una merma no se edita',
      text:
        'Los movimientos de inventario son insert-only: la base rechaza cualquier cambio o borrado. Si escribiste 10 kg en vez de 1, se corrige desde Gestión → Inventario → Movimientos → Anular, que devuelve las unidades con su costo original. Quedan los dos renglones a la vista, que es justamente lo que permite auditar.',
    },
    {
      kind: 'note',
      text:
        'Lo que se te dañó mientras cocinabas una tanda NO se registra aparte: ya está contado. La receta descuenta el porcentaje de merma que tenga cargado. La merma que se registra acá es la extraordinaria, la que no estaba prevista.',
    },
  ],
  questions: [
    {
      q: '¿Cómo registro una merma si mi repollo salió defectuoso?',
      a: 'Cocina → Inventario → busca "Repollo" → botón Merma → cantidad en la unidad que te muestre (normalmente gramos) → motivo "llegó defectuoso / con hongo" → foto → Guardar. Si llegó así del proveedor, avísale también al dueño desde Cocina → Incidencias: la merma descuenta el inventario, pero la incidencia es lo que hace que alguien hable con ese proveedor.',
    },
    {
      q: 'Se me quemó una tanda de pollo sazonado. ¿Merma del pollo crudo o del sazonado?',
      a: 'Del pollo SAZONADO, que es lo que se perdió. El pollo crudo ya se había descontado cuando registraste la producción; mermarlo otra vez lo descontaría dos veces.',
    },
    {
      q: 'Boté media caja de tomates pero no sé cuánto pesaba.',
      a: 'Estima y regístralo. Un número aproximado es infinitamente mejor que no registrar: sin el movimiento, el sistema cree que esos tomates están disponibles y la caja los sigue vendiendo. Escribe en el motivo que fue estimado, y cuadra con un conteo físico cuando puedas.',
    },
    {
      q: '¿Registro merma cuando se me cae un plato ya servido?',
      a: 'No como merma de insumo. Si el pedido ya se cobró, eso es un reembolso desde la caja (Historial → Reembolsar): la comida se preparó de verdad, así que el inventario NO se devuelve y la pérdida queda en su propia línea. Si todavía no se cobraba, sí registra la merma de los insumos que se perdieron.',
    },
    {
      q: 'Registré una merma de más. ¿La borro?',
      a: 'No se puede borrar: los movimientos de inventario son permanentes a propósito. Se anula desde Gestión → Inventario → Movimientos → botón Anular en esa fila, con el motivo. Puedes anular solo una parte: si mermaste 10 y en realidad fue 1, devuelves 9.',
    },
  ],
  seeAlso: ['cocina', 'inventario', 'reglas'],
};

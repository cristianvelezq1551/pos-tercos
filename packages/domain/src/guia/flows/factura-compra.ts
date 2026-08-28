import type { GuideFlow } from '../types';

export const FLOW_FACTURA: GuideFlow = {
  id: 'confirmar-factura',
  area: 'compras',
  title: 'Subir y confirmar una factura de compra',
  summary: 'Meter al inventario lo que compraste y actualizar el costo real de todos tus platos.',
  audience: ['dueno'],
  icon: 'receipt',
  when:
    'Cada vez que llega mercancía con su factura. Es el paso más importante de la semana: mientras no se confirme, el inventario no tiene lo que compraste y los costos siguen con precios viejos.',
  before: ['Tener la factura, en papel o foto. Si el proveedor no da factura, hay carga manual.'],
  steps: [
    { do: 'Gestión → Compras → Facturas → Nueva.' },
    {
      do: 'Sube la foto. La inteligencia artificial lee proveedor, número, ítems, cantidades, precios y total.',
      why: 'Transcribir veinte renglones a mano es donde se cometen los errores que nadie encuentra después.',
    },
    {
      do: 'Revisa línea por línea y asocia cada una con el insumo o producto que le corresponde.',
      why: 'El sistema sugiere el más parecido por nombre, pero la decisión es tuya. Asociar mal le suma stock al insumo equivocado y descuadra dos cosas a la vez.',
    },
    { do: 'Si compraste algo que no existe en el catálogo, créalo ahí mismo con "Crear nuevo".' },
    { do: 'Verifica que el total y el IVA coincidan con el papel.' },
    {
      do: 'Si ya la pagaste, marca el bloque de pago: de qué bolsillo salió y sube el comprobante.',
      why: 'Si la vas a pagar después, déjala sin marcar: aparece como compromiso pendiente.',
    },
    { do: 'Confirma.' },
  ],
  sightings: [
    {
      where: 'Gestión → Inventario → Existencias',
      what: 'Cada insumo de la factura con más cantidad, al instante.',
    },
    {
      where: 'Gestión → Catálogo → Productos',
      what: 'El costo de tus platos cambia solo.',
      means:
        'Es el efecto que más se subestima: confirmar una factura re-costea todo lo que use esos insumos. Si el pollo subió, tus hamburguesas cuestan más desde ese momento y el margen que ves es el real.',
    },
    {
      where: 'Gestión → Inventario → Deudas',
      what: 'Los insumos que estaban en negativo se saldan.',
      means:
        'Y no solo la cantidad: el costo que se había ESTIMADO para las ventas que ya salieron se corrige al costo real, imputado al mes en que se consumió. Por eso vale la pena subir facturas viejas.',
    },
    {
      where: 'Gestión → Finanzas → Estado financiero',
      what: 'Si la marcaste pagada, baja el bolsillo; el costo entra al resultado cuando se venda lo comprado.',
      means:
        'Comprar no es gastar todavía: la plata sale del bolsillo, pero el costo pega al resultado del mes cuando el insumo se convierte en venta. Eso es lo que hace que el margen sea real.',
    },
    {
      where: 'Gestión → Compras → Proveedores',
      what: 'Se guarda cuánto te cobró ese proveedor por cada cosa.',
      means: 'Es lo que te deja ver si te subieron el precio antes de volver a pedir.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'El precio de la factura es COSTO, no precio de venta',
      text:
        'Lo que te cobró el proveedor actualiza el costo. El precio al que le vendes al cliente no se toca nunca desde acá. La pantalla te avisa con un banner ámbar justamente porque confundirlos borra el margen.',
    },
    {
      kind: 'warn',
      text:
        'Una factura sin confirmar no existe para el sistema: no suma inventario ni corrige costos. Queda como borrador hasta que la confirmes.',
    },
    {
      kind: 'note',
      text:
        'Si es la factura de siempre, usa "Clonar" sobre una anterior confirmada: trae proveedor e ítems y solo escribes los montos.',
    },
  ],
  questions: [
    {
      q: 'El proveedor no me da factura.',
      a: 'Usa la carga manual, que pide los mismos campos. Lo importante es que el movimiento de inventario y el costo queden registrados; el papel es secundario para el sistema.',
    },
    {
      q: 'Compré algo hace tres semanas y no lo he subido.',
      a: 'Súbela igual, con su fecha real. El sistema salda las deudas de inventario que se generaron y corrige a costo real lo que se vendió estimado, imputándolo al mes del consumo. Llegar tarde es mucho mejor que no llegar.',
    },
    {
      q: 'La IA leyó mal una cantidad.',
      a: 'Corrígela en la pantalla antes de confirmar. La IA transcribe; tú validas. Lo que se confirma es lo que tú apruebas.',
    },
    {
      q: '¿Qué pasa si asocio mal un renglón?',
      a: 'Le suma stock al insumo equivocado y le actualiza el costo a ese. Se corrige con ajustes de inventario en los dos insumos, pero es engorroso: vale la pena revisar antes de confirmar.',
    },
  ],
  seeAlso: ['compras', 'inventario', 'catalogo'],
};

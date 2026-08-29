import type { GuideFlow } from '../types';

export const FLOW_CERRAR_CAJA: GuideFlow = {
  id: 'cerrar-caja',
  area: 'caja',
  title: 'Cerrar la caja del turno',
  summary: 'Contar toda la plata —el cajón y cada medio digital— y dejar explicado cualquier descuadre.',
  audience: ['caja', 'dueno'],
  icon: 'wallet',
  when:
    'Al terminar la jornada. El día de la caja va de 4:00 am a 3:59 am, así que a la 1 am sigues en el turno de la noche; a las 4 am la caja pasa a vencida y el sistema exige cerrarla antes de vender otra vez.',
  before: [
    'No pueden quedar ventas offline sin sincronizar: el sistema lo bloquea porque el esperado quedaría incompleto.',
    'No pueden quedar cuentas abiertas sin resolver: al cerrar te obliga a cobrarlas, traspasarlas o cancelarlas.',
  ],
  steps: [
    { do: 'Caja → Caja → Cerrar turno. Se abre el informe con todo lo vendido.' },
    {
      do: 'Cuenta el efectivo del cajón. Puedes escribir el total o activar el conteo por denominación.',
      why: 'El conteo por denominación suma solo y deja constancia de cuántos billetes de cada valor había. Con "conteo ciego" el esperado queda oculto hasta que terminas: así cuentas lo que hay, no lo que debería haber.',
    },
    {
      do: 'Arquea cada medio digital: escribe cuánto dice la app del banco.',
      why: 'Es obligatorio. El botón de cerrar sigue apagado mientras falte alguno. Contar CERO sí es arquear; dejar el campo vacío es lo que bloquea.',
    },
    { do: 'Si hubo propinas, escríbelas en su campo. Van en un bote aparte, no suman al esperado.' },
    { do: 'Deja una nota si pasó algo que explique una diferencia, y cierra.' },
  ],
  sightings: [
    {
      where: 'Caja → Arqueos',
      what: 'El cierre con apertura, ventas en efectivo, entradas y salidas, esperado, contado y descuadre.',
      means:
        'El "esperado" es: base de apertura + ventas en efectivo − la parte de domicilio de esas ventas + entradas − salidas. Si no te cuadra, casi siempre falta registrar un movimiento de efectivo.',
    },
    {
      where: 'Gestión → Caja → Turnos',
      what: 'La tabla con Efectivo · Cuenta · Total de cada turno.',
      means: 'Contado arriba, esperado y diferencia debajo. Un turno viejo sin arquear queda marcado y su total no se calcula: sumar lo que falta inventaría un faltante.',
    },
    {
      where: 'Gestión → Reportes → Anomalías',
      what: 'Compara a cada persona contra SU propio histórico de descuadres, anulaciones y aperturas de cajón sin venta.',
      means: 'Una marca no es una acusación: es una señal de que vale la pena preguntar. Necesita al menos cinco turnos para tener con qué comparar.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Caja',
      what: 'El cierre con su descuadre.',
      means: 'Si el descuadre pasa de $5.000 —en efectivo, en un medio digital, o entre los dos sumados— queda una alerta y le llega un WhatsApp al dueño en el momento.',
    },
  ],
  pitfalls: [
    {
      kind: 'rule',
      title: 'El domicilio no está en el cajón',
      text:
        'Al domiciliario se le paga al entregar, siempre. Cuando cierras, esa plata ya salió. Por eso el esperado descuenta el cobro del envío de cualquier medio por el que haya entrado. Si lo esperara, cada domicilio te marcaría un faltante que no existe.',
    },
    {
      kind: 'warn',
      text:
        'Cerrar sesión NO cierra el turno. Son cosas distintas: el turno se cierra contando la plata desde esta pantalla. Si cierras sesión con el turno abierto, la caja sigue abierta y al día siguiente aparece vencida.',
    },
  ],
  questions: [
    {
      q: 'Me sobran $20.000 en el cajón.',
      a: 'Casi siempre es una venta cobrada en efectivo que se registró como transferencia, o una entrada de efectivo sin registrar. Revisa el historial del turno: si encuentras la venta mal clasificada, corrígela con el botón "Pago" antes de cerrar. Si no aparece, cierra con el sobrante y explícalo en la nota: un descuadre explicado vale más que uno maquillado.',
    },
    {
      q: 'Me faltan $50.000 y pagué un domiciliario del cajón.',
      a: 'Ahí está. El pago al domiciliario tiene que quedar como salida de efectivo en Caja → Caja → Movimientos, con su motivo. Regístralo y el esperado baja solo. Si ya cerraste, queda como descuadre explicable en la nota.',
    },
    {
      q: 'No puedo cerrar: el botón está apagado.',
      a: 'Tres causas, en orden: falta arquear algún medio digital (contar 0 cuenta, dejar vacío no), quedan cuentas abiertas sin resolver, o hay ventas offline sin sincronizar. La pantalla te dice cuál es.',
    },
    {
      q: '¿Qué hago con las propinas?',
      a: 'Se escriben en su campo al cerrar y van en un bote aparte: no suman al efectivo esperado. Después aparecen repartidas por persona en la nómina, proporcionalmente a los días trabajados, pero como dato informativo — no entran al total a pagar.',
    },
  ],
  seeAlso: ['caja-cierre', 'reglas'],
};

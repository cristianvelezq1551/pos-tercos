import type { GuideFlow } from '../types';

export const FLOW_CHECKLIST: GuideFlow = {
  id: 'checklist-cocina',
  area: 'cocina',
  title: 'Hacer el checklist de apertura o cierre',
  summary: 'Marcar las rutinas del turno para que quede constancia de que se hicieron.',
  audience: ['cocina', 'dueno'],
  icon: 'clipboard-check',
  when:
    'Al abrir la cocina y al cerrarla. Se marca mientras haces cada cosa, no todo junto al final: marcar diez ítems seguidos a las 11 de la noche no prueba nada y todos lo saben.',
  before: ['Que el dueño haya cargado los puntos del checklist. Si la lista sale vacía, es eso.'],
  steps: [
    { do: 'Cocina → Checklist. Elige Apertura o Cierre según el momento.' },
    {
      do: 'Toca la fila completa de cada punto que vayas terminando.',
      why: 'Se guarda solo en el momento. Si se va la luz o se cierra la app, no pierdes lo marcado.',
    },
    { do: 'Cuando estén todos, toca "Cerrar rutina".' },
  ],
  sightings: [
    {
      where: 'Cocina → Checklist',
      what: 'El contador "N de M hechas" y tu nombre junto a cada punto marcado.',
      means: 'Con dos personas en cocina, el nombre es lo que permite saber quién hizo qué.',
    },
    {
      where: 'Gestión → Cocina → pestaña Checklist',
      what: 'El histórico por día: qué rutina se completó, a qué hora y quién marcó cada punto.',
      means: 'Es la vista del dueño. Una rutina que se cierra siempre a la misma hora exacta suele significar que se marca de a diez al final.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Cocina',
      what: 'El registro de la rutina completada.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text:
        'Hay una rutina de apertura y una de cierre por día. Si ya la cerraste y falta algo, vuelve a marcarlo: lo que importa es que el estado final refleje la realidad.',
    },
    {
      kind: 'warn',
      text:
        'Si un punto no aplica hoy, no lo marques por marcar. Un checklist con todo en verde siempre deja de servir para detectar el día en que algo sí falló.',
    },
  ],
  questions: [
    {
      q: 'La lista me sale vacía.',
      a: 'El dueño todavía no ha cargado los puntos. Se administran en Gestión → Operación → Cocina → Ítems del checklist. Avísale.',
    },
    {
      q: 'Marqué un punto por error.',
      a: 'Vuelve a tocarlo y se desmarca. Mientras la rutina no esté cerrada, puedes corregir libremente.',
    },
    {
      q: '¿Tengo que cerrar la rutina o basta con marcar todo?',
      a: 'Ciérrala. Marcar los puntos deja el avance; cerrarla es lo que la da por terminada en el histórico del dueño.',
    },
  ],
  seeAlso: ['cocina'],
};

export const FLOW_INCIDENCIA: GuideFlow = {
  id: 'reportar-incidencia',
  area: 'cocina',
  title: 'Reportar una incidencia',
  summary: 'Avisarle al dueño de un problema que tú no puedes resolver.',
  audience: ['cocina', 'dueno'],
  icon: 'triangle-alert',
  when:
    'Se dañó la nevera, llegó mercancía en mal estado, falta gas, un equipo hace un ruido raro. Cualquier cosa que necesite que alguien con plata o con teléfono actúe.',
  before: [],
  steps: [
    { do: 'Cocina → Incidencias → Nueva.' },
    { do: 'Elige la categoría que más se acerque.' },
    {
      do: 'Describe qué pasó con detalle: qué equipo, desde cuándo, qué se ve o se oye.',
      why: 'El dueño no está en la cocina. "La nevera falla" no le sirve para llamar al técnico; "la nevera de abajo no enfría desde ayer y hace un ruido fuerte" sí.',
    },
    { do: 'Guarda.' },
  ],
  sightings: [
    {
      where: 'Cocina → Incidencias',
      what: 'La lista con las tuyas y su estado: abierta o resuelta.',
    },
    {
      where: 'Gestión → Operación → Cocina → Incidencias',
      what: 'El dueño las ve todas y las marca como resueltas.',
      means: 'Una incidencia abierta hace días es una tarea que se quedó sin dueño; para eso está a la vista.',
    },
    {
      where: 'Gestión → Auditoría → Bitácora → Cocina',
      what: 'Quién la reportó y cuándo.',
    },
  ],
  pitfalls: [
    {
      kind: 'note',
      text:
        'Si un insumo llegó dañado, la incidencia NO reemplaza la merma. La merma saca el producto del inventario; la incidencia hace que alguien hable con el proveedor. Van las dos.',
    },
  ],
  questions: [
    {
      q: '¿Uso incidencias para pedir insumos que se acabaron?',
      a: 'No hace falta: el sistema detecta solo lo que está bajo el mínimo y se lo sugiere al dueño. Usa incidencias para lo que el sistema no puede ver, como un equipo dañado.',
    },
    {
      q: 'Reporté algo y nadie hace nada.',
      a: 'La incidencia queda abierta y visible en el panel del dueño hasta que alguien la marque resuelta. Si es urgente, la incidencia deja el registro pero la llamada la haces igual.',
    },
  ],
  seeAlso: ['cocina'],
};

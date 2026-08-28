/**
 * Modelo de contenido de la guía. El texto vive como DATOS tipados en el repo
 * (no en la base): se versiona con git, se revisa en el PR y no se puede
 * desincronizar en silencio. Nadie lo edita desde la app.
 *
 * Está en `domain` y no en `packages/guia` porque el asistente de IA corre en
 * el API, que necesita leerlo para responder con base en él. Es dato puro, sin
 * dependencias ni IO.
 */

/** Quién usa lo que se está explicando. */
export type Audience = 'caja' | 'cocina' | 'dueno';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  caja: 'Caja',
  cocina: 'Cocina',
  dueno: 'Dueño',
};

/** Un paso del procedimiento: qué haces y, si no es evidente, por qué. */
export interface GuideStep {
  /** La acción concreta. Empieza con un verbo. */
  do: string;
  /** La razón detrás. Solo cuando aporta — no repitas el paso en otras palabras. */
  why?: string;
}

export interface TableBlock {
  kind: 'table';
  head: string[];
  rows: string[][];
}

/**
 * Bloques de contenido. Union discriminada: agregar un tipo obliga a cubrirlo
 * en el renderer (el compilador lo exige).
 */
export type GuideBlock =
  | { kind: 'prose'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'steps'; title?: string; steps: GuideStep[] }
  /** Regla dura del negocio. Se rompe y los números dejan de cuadrar. */
  | { kind: 'rule'; title: string; text: string }
  /** Aclaración útil, sin consecuencias si se ignora. */
  | { kind: 'note'; text: string }
  /** Advertencia: hacerlo mal cuesta plata o deja rastro imposible de borrar. */
  | { kind: 'warn'; text: string }
  | TableBlock;

export interface GuideSection {
  /** Ancla en la URL: /guia/<capítulo>#<id>. kebab-case, estable. */
  id: string;
  title: string;
  audience: Audience[];
  /** Dónde vive en la app, tal cual lo lee una persona. Ej: "Caja → Arqueos". */
  where?: string;
  /** Una frase: qué resuelve esta sección. Se muestra bajo el título. */
  summary: string;
  blocks: GuideBlock[];
}

export interface GuideChapter {
  /** Segmento de la URL: /guia/<id>. */
  id: string;
  title: string;
  /** Kicker sobre el título. */
  eyebrow: string;
  /** Nombre del ícono en el mapa de `chapter-icons.ts`. */
  icon: string;
  /** Para qué sirve el capítulo, en una frase. */
  summary: string;
  /** Párrafo de entrada del capítulo. */
  intro: string;
  sections: GuideSection[];
}


// ====================================================================
// FLUJOS — el "cómo se hace" y, sobre todo, DÓNDE aterriza cada número
// ====================================================================

/**
 * Un lugar de la app donde se ve el resultado de un flujo, y qué significa lo
 * que se ve ahí.
 *
 * Es la parte que faltaba: los capítulos explican qué es una merma y por qué se
 * registra, pero nadie sabía en qué seis pantallas aparece después ni por qué
 * el número no es el mismo en todas.
 */
export interface FlowSighting {
  /** Dónde, como lo lee una persona. Ej: "Gestión → Reportes → Uso y mermas". */
  where: string;
  /** Qué vas a ver ahí exactamente. */
  what: string;
  /** Qué significa, cuando el número engaña o no es obvio. */
  means?: string;
  /** Cuánto tarda en aparecer, si no es inmediato. */
  delay?: string;
}

/** Una pregunta real, con su respuesta corta. Alimenta también al asistente. */
export interface FlowQuestion {
  q: string;
  a: string;
}

/** Agrupador de flujos. Con treinta tarjetas sueltas no se encuentra nada. */
export type FlowArea =
  | 'caja'
  | 'cocina'
  | 'catalogo'
  | 'compras'
  | 'inventario'
  | 'finanzas'
  | 'personal'
  | 'control';

export const FLOW_AREA_LABEL: Record<FlowArea, string> = {
  caja: 'Caja y ventas',
  cocina: 'Cocina',
  catalogo: 'Catálogo y recetas',
  compras: 'Compras y proveedores',
  inventario: 'Inventario',
  finanzas: 'Dinero del negocio',
  personal: 'Personal y configuración',
  control: 'Control y auditoría',
};

export interface GuideFlow {
  /** Segmento de la URL: /guia/flujos/<id>. kebab-case, estable. */
  id: string;
  /** Dónde se agrupa en el índice. */
  area: FlowArea;
  title: string;
  /** Una frase: qué logra este flujo. */
  summary: string;
  audience: Audience[];
  /** Nombre del ícono en `chapter-icons.ts`. */
  icon: string;
  /** El disparador real: cuándo, en la vida del negocio, se hace esto. */
  when: string;
  /** Qué tiene que existir antes de empezar. Vacío = nada. */
  before: string[];
  /** El paso a paso. */
  steps: GuideStep[];
  /** Dónde se ve el resultado. El corazón del flujo. */
  sightings: FlowSighting[];
  /** Errores que la gente comete de verdad, y cómo se salen de ellos. */
  pitfalls: GuideBlock[];
  /** Preguntas concretas con nombre propio ("el repollo salió defectuoso"). */
  questions: FlowQuestion[];
  /** Capítulos relacionados, por id, para leer el porqué. */
  seeAlso?: string[];
}

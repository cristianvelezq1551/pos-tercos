/**
 * Modelo de contenido de la guía. El texto vive como DATOS tipados en el repo
 * (no en la base): se versiona con git, se revisa en el PR y no se puede
 * desincronizar en silencio. Nadie lo edita desde la app.
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

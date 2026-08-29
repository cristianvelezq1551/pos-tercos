import { CHAPTERS, type Audience, type GuideChapter, type GuideSection } from '@pos-tercos/domain/guia';

/**
 * Los temas que le tocan a una audiencia. El modelo de contenido ya declara
 * `audience` por sección, así que la app de cocina no necesita su propia lista
 * de capítulos: pide los suyos y siempre quedan al día cuando el contenido crece.
 */
export function sectionsFor(audience: Audience): GuideSection[] {
  return CHAPTERS.flatMap((c) => c.sections.filter((s) => s.audience.includes(audience)));
}

/**
 * Los capítulos que tienen al menos un tema de esa audiencia, ya podados: cada
 * capítulo conserva SOLO las secciones que le sirven. Mostrarle al cocinero el
 * capítulo de finanzas entero para que encuentre una sección suya es ruido.
 */
export function chaptersFor(audience: Audience): GuideChapter[] {
  return CHAPTERS.map((c) => ({
    ...c,
    sections: c.sections.filter((s) => s.audience.includes(audience)),
  })).filter((c) => c.sections.length > 0);
}

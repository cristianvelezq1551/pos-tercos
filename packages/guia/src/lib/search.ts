import { ALL_SECTIONS, type FlatSection } from '@pos-tercos/domain';

export const MIN_QUERY_LENGTH = 2;
export const MAX_RESULTS = 12;

/** Peso de dónde cae cada palabra. El título manda sobre el cuerpo. */
const WEIGHT_TITLE = 8;
const WEIGHT_SUMMARY = 3;
const WEIGHT_BODY = 1;
/** Premio por la frase completa: "cerrar caja" junto vale más que suelto. */
const BONUS_PHRASE = 6;

function scoreSection(section: FlatSection, words: string[], term: string): number {
  const title = section.section.title.toLowerCase();
  const summary = section.section.summary.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (title.includes(w)) score += WEIGHT_TITLE;
    else if (summary.includes(w)) score += WEIGHT_SUMMARY;
    else score += WEIGHT_BODY;
  }
  if (words.length > 1 && `${title} ${summary}`.includes(term)) score += BONUS_PHRASE;
  return score;
}

/**
 * Busca secciones de la guía.
 *
 * Cada palabra tiene que aparecer (AND, no OR): "cerrar caja" trae lo que habla
 * de cerrar la caja, no todo lo que mencione "caja". Busca sobre el texto
 * completo de los bloques, así que "descuadre" cae en la sección que lo explica
 * aunque el título no lo diga.
 *
 * El orden pesa DÓNDE cayó cada palabra: sin esto, buscar "cerrar caja" ponía
 * primero secciones que solo mencionan las dos palabras de pasada y dejaba
 * "Cerrar el turno" en el sexto lugar. A igualdad de puntaje gana el orden de
 * lectura de la guía (el arreglo de entrada ya viene en ese orden).
 */
export function searchSections(
  query: string,
  sections: readonly FlatSection[] = ALL_SECTIONS,
): FlatSection[] {
  const term = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (term.length < MIN_QUERY_LENGTH) return [];
  const words = term.split(' ');
  return sections
    .filter((s) => words.every((w) => s.haystack.includes(w)))
    .map((section, i) => ({ section, i, score: scoreSection(section, words, term) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_RESULTS)
    .map((r) => r.section);
}

/**
 * Biblia de capacitación — contenido compartido entre el admin y la cocina.
 *
 * Vive en su propio paquete porque no es de ninguna de las dos apps: el admin
 * muestra los 12 capítulos y la cocina filtra los temas que le tocan al
 * cocinero. Poner el contenido en una y que la otra lo importe cruzaría el
 * límite entre apps; ponerlo en `domain` (lógica pura) o en `ui` (componentes)
 * lo escondería donde nadie lo busca.
 */
export * from './content';
export { ChapterView } from './components/ChapterView';
export { ChapterCard } from './components/ChapterCard';
export { GuiaSearch } from './components/GuiaSearch';
export { GuideSectionView } from './components/GuideSectionView';
export { HashScroller } from './components/HashScroller';
export { chapterIcon } from './components/chapter-icons';
export { searchSections, MIN_QUERY_LENGTH, MAX_RESULTS } from './lib/search';
export { sectionsFor, chaptersFor } from './lib/audience';

/**
 * Biblia de capacitación — contenido compartido entre el admin y la cocina.
 *
 * Vive en su propio paquete porque no es de ninguna de las dos apps: el admin
 * muestra los 12 capítulos y la cocina filtra los temas que le tocan al
 * cocinero. Poner el contenido en una y que la otra lo importe cruzaría el
 * límite entre apps; ponerlo en `domain` (lógica pura) o en `ui` (componentes)
 * lo escondería donde nadie lo busca.
 */
// El CONTENIDO vive en `@pos-tercos/domain/guia`: el asistente de IA corre en el
// API (NestJS) y necesita leer los flujos para responder con base en ellos. Este
// paquete es source-only —lo transpilan los Next— así que el API no puede
// importarlo; `domain` sí compila a dist. Acá se re-exporta para que las apps
// sigan pidiéndole todo a la guía.
export {
  CHAPTERS,
  FLOWS,
  TOTAL_SECTIONS,
  ALL_SECTIONS,
  AUDIENCE_LABEL,
  findChapter,
  findFlow,
  chapterNeighbors,
  flowsFor,
  flowsByArea,
  FLOW_AREA_LABEL,
} from '@pos-tercos/domain/guia';
export type {
  Audience,
  GuideBlock,
  GuideChapter,
  GuideSection,
  GuideStep,
  GuideFlow,
  FlowArea,
  TableBlock,
  FlatSection,
} from '@pos-tercos/domain/guia';
export { ChapterView } from './components/ChapterView';
export { FlowView } from './components/FlowView';
export { FlowCard } from './components/FlowCard';
export { FlowIndex } from './components/FlowIndex';
export { GuiaAsistente } from './components/GuiaAsistente';
export { GuiaAsistenteFlotante } from './components/GuiaAsistenteFlotante';
export { ChapterCard } from './components/ChapterCard';
export { GuiaSearch } from './components/GuiaSearch';
export { GuideSectionView } from './components/GuideSectionView';
export { HashScroller } from './components/HashScroller';
export { chapterIcon } from './components/chapter-icons';
export { searchSections, MIN_QUERY_LENGTH, MAX_RESULTS } from './lib/search';
export { sectionsFor, chaptersFor } from './lib/audience';

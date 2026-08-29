import { CAJA_CIERRE } from './caja-cierre';
import { CAJA_VENDER } from './caja-vender';
import { CATALOGO } from './catalogo';
import { COCINA } from './cocina';
import { COMPRAS } from './compras';
import { FINANZAS } from './finanzas';
import { INVENTARIO } from './inventario';
import { PEDIDOS_WEB } from './pedidos-web';
import { PERSONAL } from './personal';
import { REGLAS } from './reglas';
import { REPORTES } from './reportes';
import { SISTEMA } from './sistema';
import type { GuideBlock, GuideChapter, GuideSection } from './types';

/**
 * Orden de LECTURA (no alfabético): primero cómo está armado el sistema, luego
 * la operación diaria, después configuración y control. Es el orden en que se
 * entrena a alguien nuevo.
 */
export const CHAPTERS: readonly GuideChapter[] = [
  SISTEMA,
  CAJA_VENDER,
  CAJA_CIERRE,
  PEDIDOS_WEB,
  COCINA,
  CATALOGO,
  COMPRAS,
  INVENTARIO,
  FINANZAS,
  REPORTES,
  PERSONAL,
  REGLAS,
] as const;

export function findChapter(id: string): GuideChapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

/** Capítulo anterior y siguiente, para navegar de corrido. */
export function chapterNeighbors(id: string): {
  prev: GuideChapter | null;
  next: GuideChapter | null;
} {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? CHAPTERS[i - 1]! : null,
    next: i < CHAPTERS.length - 1 ? CHAPTERS[i + 1]! : null,
  };
}

export interface FlatSection {
  chapterId: string;
  chapterTitle: string;
  section: GuideSection;
  /** Título, resumen y texto de los bloques, en minúsculas — base del buscador. */
  haystack: string;
}

/** Texto plano de un bloque, para poder buscar dentro del contenido. */
function blockText(block: GuideBlock): string {
  switch (block.kind) {
    case 'prose':
    case 'note':
    case 'warn':
      return block.text;
    case 'bullets':
      return block.items.join(' ');
    case 'steps':
      return [block.title ?? '', ...block.steps.map((s) => `${s.do} ${s.why ?? ''}`)].join(' ');
    case 'rule':
      return `${block.title} ${block.text}`;
    case 'table':
      return [...block.head, ...block.rows.flat()].join(' ');
  }
}

export const ALL_SECTIONS: readonly FlatSection[] = CHAPTERS.flatMap((chapter) =>
  chapter.sections.map((section) => ({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    section,
    haystack: [
      section.title,
      section.summary,
      section.where ?? '',
      ...section.blocks.map(blockText),
    ]
      .join(' ')
      .toLowerCase(),
  })),
);

export const TOTAL_SECTIONS = ALL_SECTIONS.length;

export * from './types';
export * from './flows';
export * from './assistant-prompt';
export * from './voseo';

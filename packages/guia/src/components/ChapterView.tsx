import { CHAPTERS, chapterNeighbors, type GuideChapter } from '@pos-tercos/domain';
import { ChapterPager } from './ChapterPager';
import { HashScroller } from './HashScroller';
import { ChapterToc } from './ChapterToc';
import { GuideSectionView } from './GuideSectionView';

/** Un capítulo completo: intro, secciones e índice lateral. */
export function ChapterView({ chapter }: { chapter: GuideChapter }) {
  const { prev, next } = chapterNeighbors(chapter.id);
  const number = CHAPTERS.findIndex((c) => c.id === chapter.id) + 1;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <HashScroller />
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-muted-foreground">{chapter.intro}</p>

        <p className="mt-6 caps text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground lg:hidden">
          Capítulo {number} · {chapter.sections.length} temas
        </p>

        <div className="mt-8 space-y-10">
          {chapter.sections.map((section) => (
            <GuideSectionView key={section.id} section={section} />
          ))}
        </div>

        <ChapterPager prev={prev} next={next} />
      </div>

      <aside className="hidden lg:block">
        <ChapterToc chapter={chapter} />
      </aside>
    </div>
  );
}

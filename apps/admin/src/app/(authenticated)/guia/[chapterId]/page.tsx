import { Container, PageHeader } from '@pos-tercos/ui';
import { notFound } from 'next/navigation';
import { CHAPTERS, ChapterView, chapterIcon, findChapter } from '@pos-tercos/guia';

interface PageProps {
  params: Promise<{ chapterId: string }>;
}

/**
 * Declara los capítulos válidos. NO los deja estáticos de verdad: el layout
 * autenticado lee cookies, así que el árbol entero renderiza por request (igual
 * que el resto del admin). Está para que la lista de rutas del build sea la
 * lista real de capítulos.
 */
export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ chapterId: c.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { chapterId } = await params;
  const chapter = findChapter(chapterId);
  return { title: chapter ? `${chapter.title} · Guía` : 'Guía de uso' };
}

export default async function GuiaChapterPage({ params }: PageProps) {
  const { chapterId } = await params;
  const chapter = findChapter(chapterId);
  if (!chapter) notFound();

  const Icon = chapterIcon(chapter.icon);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Guía de uso', href: '/guia' }, { label: chapter.title }]}
        eyebrow={chapter.eyebrow}
        title={chapter.title}
        description={chapter.summary}
        icon={<Icon className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <ChapterView chapter={chapter} />
      </Container>
    </>
  );
}

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideSectionView, HashScroller, chaptersFor } from '@pos-tercos/guia';

interface PageProps {
  params: Promise<{ chapterId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { chapterId } = await params;
  const c = chaptersFor('cocina').find((x) => x.id === chapterId);
  return { title: c ? `${c.title} · Guía` : 'Guía' };
}

export default async function GuiaCocinaChapterPage({ params }: PageProps) {
  const { chapterId } = await params;
  // Se busca dentro de los capítulos PODADOS: si el cocinero llega por un
  // enlace a un capítulo que no le toca, es 404 y no una página vacía.
  const chapter = chaptersFor('cocina').find((c) => c.id === chapterId);
  if (!chapter) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <HashScroller />
      <Link
        href="/guia"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors active:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Guía
      </Link>

      <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground">
        {chapter.title}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{chapter.intro}</p>

      <div className="mt-6 space-y-8">
        {chapter.sections.map((s) => (
          <GuideSectionView key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}

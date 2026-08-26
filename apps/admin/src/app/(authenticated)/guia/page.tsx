import { Container, PageHeader } from '@pos-tercos/ui';
import { BookOpen } from 'lucide-react';
import { CHAPTERS, ChapterCard, GuiaSearch, TOTAL_SECTIONS } from '../../../features/guia';

export const metadata = { title: 'Guía de uso · POS Tercos' };

/**
 * Portada de la guía. Sin guard de rol: todo el que entra al admin la ve
 * completa, incluidos los capítulos de módulos que no usa — sirve para
 * entrenar a alguien que va a rotar de puesto.
 */
export default function GuiaIndexPage() {
  return (
    <>
      <PageHeader
        eyebrow="Capacitación"
        title="Guía de uso"
        description={`Cómo funciona cada parte del sistema y cómo se hace cada cosa, paso a paso. ${CHAPTERS.length} capítulos, ${TOTAL_SECTIONS} temas.`}
        icon={<BookOpen className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="max-w-2xl">
          <GuiaSearch />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CHAPTERS.map((chapter, i) => (
            <ChapterCard key={chapter.id} chapter={chapter} index={i} />
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Cada tema trae la etiqueta de quién lo usa. Ves todos porque entender la caja ayuda a
          entender por qué el inventario se mueve como se mueve, aunque nunca cobres un pedido.
          Si algo de acá no coincide con lo que hace la aplicación, gana la aplicación: avísale al
          dueño para corregir el texto.
        </p>
      </Container>
    </>
  );
}

import { Container, PageHeader } from '@pos-tercos/ui';
import { BookOpen } from 'lucide-react';
import { CHAPTERS, ChapterCard, FLOWS, FlowIndex, GuiaSearch } from '@pos-tercos/guia';

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
        description={`${FLOWS.length} flujos paso a paso —con dónde se ve cada resultado— y ${CHAPTERS.length} capítulos para entender por qué el sistema funciona así.`}
        icon={<BookOpen className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="max-w-2xl space-y-3">
          <GuiaSearch />
          {/* El asistente pasó a la burbuja de abajo a la derecha, que está en
              TODAS las pantallas. Repetirlo acá sería el mismo formulario dos
              veces en la misma página. */}
          <p className="text-xs text-muted-foreground">
            ¿Prefieres preguntar con tus palabras? Usa el botón{' '}
            <span className="font-semibold text-foreground">Ayuda</span> de la esquina inferior
            derecha: está en todas las pantallas y responde con lo que dice esta guía.
          </p>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Paso a paso
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cómo se hace cada cosa y —sobre todo— dónde aterriza después cada número.
          </p>
          <div className="mt-5">
            <FlowIndex />
          </div>
        </section>

        <h2 className="mt-10 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Entender el sistema
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Qué es cada módulo y por qué funciona así.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

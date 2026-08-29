import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlowView, flowsFor } from '@pos-tercos/guia';

interface PageProps {
  params: Promise<{ flowId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { flowId } = await params;
  const f = flowsFor('cocina').find((x) => x.id === flowId);
  return { title: f ? `${f.title} · Guía` : 'Guía' };
}

export default async function FlujoCocinaPage({ params }: PageProps) {
  const { flowId } = await params;
  // Se busca solo entre los del cocinero: si llega por un enlace a un flujo que
  // no le toca, es 404 y no una página que no puede usar.
  const flow = flowsFor('cocina').find((f) => f.id === flowId);
  if (!flow) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <Link
        href="/guia"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground active:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Guía
      </Link>
      <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground">
        {flow.title}
      </h1>
      <div className="mt-4">
        <FlowView flow={flow} />
      </div>
    </div>
  );
}

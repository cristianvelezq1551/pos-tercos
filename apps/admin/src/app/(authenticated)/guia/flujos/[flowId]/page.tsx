import { Container, PageHeader } from '@pos-tercos/ui';
import { notFound } from 'next/navigation';
import { FLOWS, FlowView, chapterIcon, findFlow } from '@pos-tercos/guia';

interface PageProps {
  params: Promise<{ flowId: string }>;
}

export function generateStaticParams() {
  return FLOWS.map((f) => ({ flowId: f.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { flowId } = await params;
  const f = findFlow(flowId);
  return { title: f ? `${f.title} · Guía` : 'Guía de uso' };
}

export default async function FlujoPage({ params }: PageProps) {
  const { flowId } = await params;
  const flow = findFlow(flowId);
  if (!flow) notFound();
  const Icon = chapterIcon(flow.icon);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Guía de uso', href: '/guia' }, { label: flow.title }]}
        eyebrow="Paso a paso"
        title={flow.title}
        icon={<Icon className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="4xl" padY="md">
        <FlowView flow={flow} />
      </Container>
    </>
  );
}

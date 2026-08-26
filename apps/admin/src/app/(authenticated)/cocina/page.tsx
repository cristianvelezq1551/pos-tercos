import { Container, PageHeader } from '@pos-tercos/ui';
import { CookingPot } from 'lucide-react';
import {
  KITCHEN_TABS,
  KitchenTabContent,
  KitchenTabs,
  type KitchenTab,
} from '../../../features/kitchen-admin';
import { RangeFilter } from '../../../features/reports-sales';
import { requireRole } from '../../../lib/guards';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; user_id?: string }>;
}

/** Las pestañas de administración no dependen del rango: mostrar el filtro ahí
 *  sugeriría que las tareas o las incidencias se acotan por fecha, y no. */
const RANGED_TABS: readonly KitchenTab[] = ['resumen', 'produccion', 'merma', 'checklist'];

function parseTab(raw: string | undefined): KitchenTab {
  const found = KITCHEN_TABS.find((t) => t.key === raw);
  return found?.key ?? 'resumen';
}

export default async function CocinaPage({ searchParams }: PageProps) {
  await requireRole(['DUENO', 'ADMIN_OPERATIVO']);
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Cocina"
        description="Qué se produjo, qué se tiró, si se cumplieron las rutinas y qué reportó cada persona."
        icon={<CookingPot className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <KitchenTabs active={tab} />
          {RANGED_TABS.includes(tab) ? <RangeFilter /> : null}
          <KitchenTabContent
            tab={tab}
            query={{ from: sp.from, to: sp.to, userId: sp.user_id }}
          />
        </div>
      </Container>
    </>
  );
}

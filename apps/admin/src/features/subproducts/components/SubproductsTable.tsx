import type { Subproduct } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Quantity,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';

interface SubproductsTableProps {
  subproducts: Subproduct[];
}

export function SubproductsTable({ subproducts }: SubproductsTableProps) {
  const columns: DataTableColumn<Subproduct>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    {
      key: 'yield',
      header: 'Yield (por batch)',
      align: 'right',
      numeric: true,
      cell: (s) => <Quantity value={s.yield} decimals={4} />,
    },
    {
      key: 'unit',
      header: 'Unidad',
      hideOnMobile: true,
      cell: (s) => s.unit,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (s) =>
        s.isActive ? (
          <Badge tone="success" size="sm">
            Activo
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Inactivo
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <span className="flex items-center justify-end gap-2">
          <Link
            href={`/subproducts/${s.id}/recipe`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Receta
          </Link>
          <span className="text-ink-300" aria-hidden>
            ·
          </span>
          <Link
            href={`/subproducts/${s.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </Link>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={subproducts}
      rowKey={(s) => s.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no tienes subproductos cargados"
          description='Subproductos son intermedios cocinados (ej. "pollo Nashville cocido") que se usan en la receta de productos vendibles.'
          action={
            <Link href="/subproducts/new">
              <Button>Crear primer subproducto</Button>
            </Link>
          }
        />
      }
    />
  );
}

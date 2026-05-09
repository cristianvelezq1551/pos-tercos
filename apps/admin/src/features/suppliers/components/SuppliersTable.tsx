import type { Supplier } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { StickyNote } from 'lucide-react';
import Link from 'next/link';

interface SuppliersTableProps {
  suppliers: Supplier[];
}

export function SuppliersTable({ suppliers }: SuppliersTableProps) {
  const columns: DataTableColumn<Supplier>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (s) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">{s.name}</span>
          {s.notes ? (
            <StickyNote
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label={s.notes}
              strokeWidth={1.75}
            />
          ) : null}
        </span>
      ),
    },
    {
      key: 'nit',
      header: 'NIT',
      numeric: true,
      hideOnMobile: true,
      cell: (s) => s.nit,
    },
    {
      key: 'phone',
      header: 'Teléfono',
      hideOnMobile: true,
      cell: (s) => s.phone ?? <span className="text-ink-300">—</span>,
    },
    {
      key: 'email',
      header: 'Email',
      hideOnMobile: true,
      cell: (s) => s.email ?? <span className="text-ink-300">—</span>,
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
        <Link
          href={`/suppliers/${s.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Editar
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={suppliers}
      rowKey={(s) => s.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no tienes proveedores cargados"
          description="Los proveedores se asocian automáticamente al confirmar facturas, pero puedes crearlos manualmente para tenerlos disponibles antes."
          action={
            <Link href="/suppliers/new">
              <Button>Crear primer proveedor</Button>
            </Link>
          }
        />
      }
    />
  );
}

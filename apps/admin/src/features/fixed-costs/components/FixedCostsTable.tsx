'use client';

import type { FixedCost } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  formatCop,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { Trash2 } from 'lucide-react';

export function FixedCostsTable({
  costs,
  onCreate,
  onEdit,
  onDelete,
}: {
  costs: FixedCost[];
  onCreate: () => void;
  onEdit: (cost: FixedCost) => void;
  onDelete: (cost: FixedCost) => void;
}) {
  const columns: DataTableColumn<FixedCost>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (c) => <span className="font-medium text-foreground">{c.name}</span>,
    },
    { key: 'category', header: 'Categoría', cell: (c) => c.category, hideOnMobile: true },
    {
      key: 'frequency',
      header: 'Frecuencia',
      cell: (c) => (
        <Badge tone="neutral" size="sm">
          {c.frequency === 'MONTHLY'
            ? 'Mensual'
            : c.frequency === 'ANNUAL'
              ? 'Anual'
              : `Puntual${c.startedAt ? ` · ${c.startedAt}` : ''}`}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      numeric: true,
      cell: (c) => (
        <span className="tabular-nums" title={c.frequency === 'ANNUAL' ? `${formatCop(c.amount / 12)} / mes` : undefined}>
          {formatCop(c.amount)}
        </span>
      ),
    },
    {
      key: 'monthly',
      header: 'Equivalente mensual',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (c) => (
        <span className="tabular-nums text-foreground">
          {formatCop(c.frequency === 'ANNUAL' ? c.amount / 12 : c.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (c) =>
        c.isActive ? (
          <Badge tone="success" size="sm">Activo</Badge>
        ) : (
          <Badge tone="neutral" size="sm">Inactivo</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(c)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(c)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={costs}
      rowKey={(c) => c.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no tienes costos fijos cargados"
          description="Carga arriendo, servicios, internet, software, etc. Se descuentan automáticamente al calcular si tu negocio gana o pierde dinero cada mes."
          action={<Button onClick={onCreate}>Crear primer costo fijo</Button>}
        />
      }
    />
  );
}

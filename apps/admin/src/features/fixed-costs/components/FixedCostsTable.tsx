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
import { fmtYmd } from '../lib/fechas';

/**
 * `recurring` = se repite solo cada mes (mensual) o cada año (anual); su
 * columna útil es el equivalente mensual. `oneTime` = pasa una vez, así que
 * mostrar "equivalente mensual" mentiría: en su lugar va la fecha del gasto.
 */
export type FixedCostsTableVariant = 'recurring' | 'oneTime';

function baseColumns(
  onEdit: (cost: FixedCost) => void,
  onDelete: (cost: FixedCost) => void,
): { nombre: DataTableColumn<FixedCost>; categoria: DataTableColumn<FixedCost>; monto: DataTableColumn<FixedCost>; estado: DataTableColumn<FixedCost>; acciones: DataTableColumn<FixedCost> } {
  return {
    nombre: {
      key: 'name',
      header: 'Nombre',
      cell: (c) => <span className="font-medium text-foreground">{c.name}</span>,
    },
    categoria: { key: 'category', header: 'Categoría', cell: (c) => c.category, hideOnMobile: true },
    monto: {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      numeric: true,
      cell: (c) => (
        <span
          className="tabular-nums"
          title={c.frequency === 'ANNUAL' ? `${formatCop(c.amount / 12)} / mes` : undefined}
        >
          {formatCop(c.amount)}
        </span>
      ),
    },
    estado: {
      key: 'status',
      header: 'Estado',
      cell: (c) =>
        c.isActive ? (
          <Badge tone="success" size="sm">Activo</Badge>
        ) : (
          <Badge tone="neutral" size="sm">Inactivo</Badge>
        ),
    },
    acciones: {
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
  };
}

export function FixedCostsTable({
  costs,
  variant,
  onCreate,
  onEdit,
  onDelete,
}: {
  costs: FixedCost[];
  variant: FixedCostsTableVariant;
  onCreate: () => void;
  onEdit: (cost: FixedCost) => void;
  onDelete: (cost: FixedCost) => void;
}) {
  const col = baseColumns(onEdit, onDelete);

  const columns: DataTableColumn<FixedCost>[] =
    variant === 'recurring'
      ? [
          col.nombre,
          col.categoria,
          {
            key: 'frequency',
            header: 'Se repite',
            cell: (c) => (
              <Badge tone="neutral" size="sm">
                {c.frequency === 'ANNUAL' ? 'Cada año' : 'Cada mes'}
              </Badge>
            ),
          },
          col.monto,
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
          col.estado,
          col.acciones,
        ]
      : [
          col.nombre,
          col.categoria,
          {
            key: 'date',
            header: 'Fecha del gasto',
            cell: (c) => (
              <span className="text-muted-foreground">
                {c.startedAt ? fmtYmd(c.startedAt) : 'Sin fecha'}
              </span>
            ),
          },
          col.monto,
          col.estado,
          col.acciones,
        ];

  return (
    <DataTable
      rows={costs}
      rowKey={(c) => c.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title={
            variant === 'recurring'
              ? 'Aún no tienes gastos que se repitan'
              : 'Aún no tienes gastos únicos cargados'
          }
          description={
            variant === 'recurring'
              ? 'Carga arriendo, servicios, internet, software, contador. Se descuentan todos los meses al calcular si tu negocio gana o pierde dinero.'
              : 'Aquí van los gastos que pasan una sola vez: aceite, productos de aseo, una reparación, una compra puntual. Pesan solo en el mes de su fecha.'
          }
          action={
            <Button onClick={onCreate}>
              {variant === 'recurring' ? 'Crear gasto recurrente' : 'Crear gasto único'}
            </Button>
          }
        />
      }
    />
  );
}

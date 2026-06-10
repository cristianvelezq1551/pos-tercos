import type { Subproduct, UserRole } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Quantity,
  formatCop,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';
import { DeleteSubproductAction } from './DeleteSubproductAction';
import { ProduceSubproductAction } from './ProduceSubproductAction';

interface SubproductsTableProps {
  subproducts: Subproduct[];
  /** Costo estimado por unidad de cada subproducto (id → costo|null). */
  costById?: Map<string, number | null>;
  /** Stock actual por subproducto (id → cantidad en `subproduct.unit`). */
  stockById?: Map<string, number>;
  /** Rol del usuario actual. Solo Dueño puede modificar receta o eliminar. */
  userRole?: UserRole;
}

export function SubproductsTable({
  subproducts,
  costById,
  stockById,
  userRole,
}: SubproductsTableProps) {
  const canEditRecipe = userRole === 'DUENO';
  const canDelete = userRole === 'DUENO';
  const canProduce = userRole === 'DUENO' || userRole === 'ADMIN_OPERATIVO';
  const columns: DataTableColumn<Subproduct>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    {
      key: 'yield',
      header: 'Rendimiento',
      align: 'right',
      numeric: true,
      cell: (s) => <Quantity value={s.yield} maxDecimals={4} />,
    },
    {
      key: 'unit',
      header: 'Unidad',
      hideOnMobile: true,
      cell: (s) => s.unit,
    },
    {
      key: 'cost',
      header: 'Costo / unidad',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (s) => {
        const cost = costById?.get(s.id);
        return cost !== null && cost !== undefined ? (
          <span className="tabular-nums">{formatCop(cost)}</span>
        ) : (
          <span className="text-ink-300" title="Falta el costo de algún insumo de la receta">
            —
          </span>
        );
      },
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      numeric: true,
      cell: (s) => {
        const stock = stockById?.get(s.id) ?? 0;
        const low = s.isActive && stock < s.thresholdMin;
        return (
          <span className="flex items-center justify-end gap-2">
            <Quantity value={stock} maxDecimals={2} />
            <span className="text-[11px] text-muted-foreground">{s.unit}</span>
            {low ? (
              <Badge tone="warning" size="sm" title={`Umbral: ${s.thresholdMin} ${s.unit}`}>
                Bajo
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Estado',
      hideOnMobile: true,
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
          {canProduce && s.isActive ? (
            <ProduceSubproductAction
              subproductId={s.id}
              name={s.name}
              unit={s.unit}
              yieldValue={s.yield}
            />
          ) : null}
          {canEditRecipe ? (
            <Link
              href={`/subproducts/${s.id}/recipe`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Receta
            </Link>
          ) : null}
          <Link
            href={`/subproducts/${s.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </Link>
          {canDelete ? <DeleteSubproductAction id={s.id} name={s.name} /> : null}
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

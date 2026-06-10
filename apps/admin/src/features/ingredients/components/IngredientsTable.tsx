import type { Ingredient, UserRole } from '@pos-tercos/types';
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
import { formatDate } from '../../../lib/format';
import { DeleteIngredientAction } from './DeleteIngredientAction';

interface IngredientsTableProps {
  ingredients: Ingredient[];
  /** Rol del usuario actual. Solo Dueño puede eliminar. */
  userRole?: UserRole;
}

export function IngredientsTable({ ingredients, userRole }: IngredientsTableProps) {
  const canDelete = userRole === 'DUENO';
  const columns: DataTableColumn<Ingredient>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (ing) => <span className="font-medium text-foreground">{ing.name}</span>,
    },
    {
      key: 'unitPurchase',
      header: 'Unidad compra',
      hideOnMobile: true,
      cell: (ing) => ing.unitPurchase,
    },
    {
      key: 'unitRecipe',
      header: 'Unidad receta',
      hideOnMobile: true,
      cell: (ing) => ing.unitRecipe,
    },
    {
      key: 'factor',
      header: 'Factor',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (ing) => <Quantity value={ing.conversionFactor} maxDecimals={4} />,
    },
    {
      key: 'threshold',
      header: 'Mínimo',
      align: 'right',
      numeric: true,
      cell: (ing) => <Quantity value={ing.thresholdMin} maxDecimals={4} />,
    },
    {
      key: 'cost',
      header: 'Último costo',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (ing) =>
        ing.lastUnitCost !== null ? (
          <span className="flex flex-col items-end">
            <span className="tabular-nums" title={`por ${ing.unitPurchase}`}>
              {formatCop(ing.lastUnitCost)}
            </span>
            {ing.lastUnitCostDate ? (
              <span className="text-[10px] text-muted-foreground">
                {formatDate(ing.lastUnitCostDate, 'short')}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-ink-300" title="Sin facturas confirmadas con este insumo">
            —
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (ing) =>
        ing.isActive ? (
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
      cell: (ing) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/ingredients/${ing.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </Link>
          {canDelete ? <DeleteIngredientAction id={ing.id} name={ing.name} /> : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={ingredients}
      rowKey={(ing) => ing.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no tienes insumos cargados"
          description="Empieza creando los insumos que compras a tus proveedores."
          action={
            <Link href="/ingredients/new">
              <Button>Crear primer insumo</Button>
            </Link>
          }
        />
      }
    />
  );
}

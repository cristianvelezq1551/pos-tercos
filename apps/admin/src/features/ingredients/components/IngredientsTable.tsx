import type { Ingredient } from '@pos-tercos/types';
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

interface IngredientsTableProps {
  ingredients: Ingredient[];
}

export function IngredientsTable({ ingredients }: IngredientsTableProps) {
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
      cell: (ing) => <Quantity value={ing.conversionFactor} decimals={4} />,
    },
    {
      key: 'threshold',
      header: 'Threshold',
      align: 'right',
      numeric: true,
      cell: (ing) => <Quantity value={ing.thresholdMin} decimals={4} />,
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
        <Link
          href={`/ingredients/${ing.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Editar
        </Link>
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
          description="Empieza creando los insumos que comprás a tus proveedores."
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

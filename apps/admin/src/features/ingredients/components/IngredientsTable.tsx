import type { Ingredient } from '@pos-tercos/types';
import Link from 'next/link';

interface IngredientsTableProps {
  ingredients: Ingredient[];
}

export function IngredientsTable({ ingredients }: IngredientsTableProps) {
  if (ingredients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no tenés insumos cargados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Empezá creando los insumos que comprás a tus proveedores.
        </p>
        <Link
          href="/ingredients/new"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Crear primer insumo
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Nombre</Th>
            <Th>Unidad compra</Th>
            <Th>Unidad receta</Th>
            <Th align="right">Factor</Th>
            <Th align="right">Threshold</Th>
            <Th>Estado</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {ingredients.map((ing) => (
            <tr key={ing.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <span className="font-medium text-gray-900">{ing.name}</span>
              </Td>
              <Td>{ing.unitPurchase}</Td>
              <Td>{ing.unitRecipe}</Td>
              <Td align="right" mono>
                {formatNumber(ing.conversionFactor)}
              </Td>
              <Td align="right" mono>
                {formatNumber(ing.thresholdMin)}
              </Td>
              <Td>
                {ing.isActive ? (
                  <Badge tone="success">Activo</Badge>
                ) : (
                  <Badge tone="muted">Inactivo</Badge>
                )}
              </Td>
              <Td align="right">
                <Link
                  href={`/ingredients/${ing.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Editar
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'success' | 'muted' }) {
  const cls =
    tone === 'success'
      ? 'bg-green-50 text-green-700 ring-green-600/20'
      : 'bg-gray-100 text-gray-600 ring-gray-500/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

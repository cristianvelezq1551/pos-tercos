import type { Product } from '@pos-tercos/types';
import Link from 'next/link';

interface ProductsTableProps {
  products: Product[];
}

export function ProductsTable({ products }: ProductsTableProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no tenés productos cargados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Productos son lo que vendés en mostrador (hamburguesas, combos, bebidas, etc.).
        </p>
        <Link
          href="/products/new"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Crear primer producto
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
            <Th>Categoría</Th>
            <Th>Tipo</Th>
            <Th align="right">Precio</Th>
            <Th>Estado</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <span className="font-medium text-gray-900">{p.name}</span>
              </Td>
              <Td>{p.category ?? <span className="text-gray-400">—</span>}</Td>
              <Td>
                {p.isCombo ? (
                  <Badge tone="combo">Combo</Badge>
                ) : (
                  <Badge tone="muted">Individual</Badge>
                )}
              </Td>
              <Td align="right" mono>
                {formatPrice(p.isCombo ? p.comboPrice ?? p.basePrice : p.basePrice)}
              </Td>
              <Td>
                {p.isActive ? (
                  <Badge tone="success">Activo</Badge>
                ) : (
                  <Badge tone="muted">Inactivo</Badge>
                )}
              </Td>
              <Td align="right">
                <Link
                  href={`/products/${p.id}/recipe`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Receta
                </Link>
                <span className="mx-2 text-gray-300">·</span>
                <Link
                  href={`/products/${p.id}`}
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

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'success' | 'muted' | 'combo';
}) {
  const map = {
    success: 'bg-green-50 text-green-700 ring-green-600/20',
    muted: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    combo: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function formatPrice(amount: number): string {
  return amount.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

import type { SupplierProduct } from '@pos-tercos/types';

interface Props {
  items: SupplierProduct[];
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * FASE 4 ajustes 2.7: tabla de items que el proveedor vende, con su
 * último precio + última fecha de compra. Polimórfica (insumos +
 * productos direct-resale).
 */
export function SupplierProductsTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        Este proveedor todavía no tiene compras confirmadas.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Item</Th>
            <Th>Tipo</Th>
            <Th align="right">Último precio</Th>
            <Th align="right">Última compra</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((sp) => (
            <tr key={sp.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <span className="font-medium text-gray-900">{sp.name ?? '(eliminado)'}</span>
              </Td>
              <Td>
                {sp.entityType === 'INGREDIENT' ? (
                  <Badge tone="ingredient">🌾 Insumo</Badge>
                ) : (
                  <Badge tone="product">📦 Producto</Badge>
                )}
              </Td>
              <Td align="right" mono>
                {sp.lastUnitPrice !== null ? (
                  COP.format(sp.lastUnitPrice)
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </Td>
              <Td align="right">
                {sp.lastPurchaseDate ? (
                  new Date(sp.lastPurchaseDate).toLocaleDateString('es-CO', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
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
  tone: 'ingredient' | 'product';
}) {
  const map = {
    ingredient: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    product: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${map[tone]}`}
    >
      {children}
    </span>
  );
}

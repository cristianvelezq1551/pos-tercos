/** Shared table primitives used by recipe editor sub-components. */

export function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
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
      className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}

export function TypeBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'ingredient' | 'subproduct';
}) {
  const cls =
    tone === 'ingredient'
      ? 'bg-success-bg/30 text-success ring-success-border'
      : 'bg-muted text-foreground ring-purple-600/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

export function formatRecipeNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

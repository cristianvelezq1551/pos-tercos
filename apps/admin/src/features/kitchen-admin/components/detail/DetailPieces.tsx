import { cn } from '@pos-tercos/ui';

/**
 * Piezas compartidas por los detalles del hub de cocina. Todas las tablas
 * responden la misma pregunta ("¿qué pasó exactamente en esta fila?") y por eso
 * se ven igual: rótulo a la izquierda, dato a la derecha.
 */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-3 border-b border-border py-2 last:border-b-0">
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('text-sm text-foreground', className)}>{children}</dd>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** La foto de evidencia vive en R2 y se sirve por el dueño del dato (§7.v34). */
export function EvidenceLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-sm text-muted-foreground">Se registró sin foto.</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      Ver la foto
    </a>
  );
}

/**
 * El nombre de la fila abre su detalle. Es la celda que identifica el renglón,
 * así que es donde la mano va sola — y evita sumar una columna "Ver" a tablas
 * que ya venían anchas.
 */
export function RowNameButton({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  /** Nombre accesible: "Ver detalle de Pan" dice a qué fila pertenece. */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded text-left font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

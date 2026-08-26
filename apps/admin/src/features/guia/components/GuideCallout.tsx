import { Info, ShieldCheck, TriangleAlert } from 'lucide-react';

type CalloutKind = 'rule' | 'note' | 'warn';

const STYLES: Record<
  CalloutKind,
  { wrap: string; icon: typeof Info; iconClass: string; label: string }
> = {
  rule: {
    wrap: 'border-primary/40 bg-primary/5',
    icon: ShieldCheck,
    iconClass: 'text-primary',
    label: 'Regla',
  },
  note: {
    wrap: 'border-border bg-muted/40',
    icon: Info,
    iconClass: 'text-muted-foreground',
    label: 'Dato',
  },
  warn: {
    wrap: 'border-warning-border bg-warning-bg',
    icon: TriangleAlert,
    iconClass: 'text-warning',
    label: 'Ojo',
  },
};

/**
 * Los tres avisos de la guía. La diferencia importa al leer:
 * regla = romperla descuadra los números; ojo = cuesta plata o deja rastro
 * imborrable; dato = útil, sin consecuencias.
 */
export function GuideCallout({
  kind,
  title,
  children,
}: {
  kind: CalloutKind;
  title?: string;
  children: React.ReactNode;
}) {
  const s = STYLES[kind];
  const Icon = s.icon;
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 ${s.wrap}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconClass}`} strokeWidth={2} aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="caps text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground">
          {title ? `${s.label} · ${title}` : s.label}
        </p>
        <div className="text-sm leading-relaxed text-foreground">{children}</div>
      </div>
    </div>
  );
}

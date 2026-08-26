import { Badge } from '@pos-tercos/ui';
import { AUDIENCE_LABEL, type Audience } from '../content';

const TONE: Record<Audience, 'info' | 'warning' | 'primary'> = {
  caja: 'info',
  cocina: 'warning',
  dueno: 'primary',
};

/** Quién usa lo que explica la sección. Todos ven todo; esto solo orienta. */
export function AudienceBadges({ audience }: { audience: readonly Audience[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {audience.map((a) => (
        <Badge key={a} tone={TONE[a]} variant="subtle" size="sm">
          {AUDIENCE_LABEL[a]}
        </Badge>
      ))}
    </span>
  );
}

import {
  Badge,
  Button,
  ButtonGroup,
  ConnectionDot,
  Chip,
  Countdown,
  DataTable,
  EmptyState,
  IconButton,
  LoadingSkeleton,
  Money,
  PageHeader,
  Percentage,
  Quantity,
  StatCard,
  StatusBadge,
  type StatusMapping,
} from '@pos-tercos/ui';
import { BrandIcon, BrandLogo, LineArtIllustration } from '@pos-tercos/brand';
import { StyleguideClientDemos } from './client-demos';

export const metadata = {
  title: 'Styleguide · POS Tercos',
};

export const dynamic = 'force-dynamic';

const SAMPLE_ROWS = [
  { id: '1', name: 'Hamburguesa Tercos', sku: 'HMB-001', stock: 142, price: 28000 },
  { id: '2', name: 'Hamburguesa BBQ', sku: 'HMB-002', stock: 86, price: 32000 },
  { id: '3', name: 'Papas crinkle', sku: 'PAP-010', stock: 5, price: 12000 },
  { id: '4', name: 'Limonada de cereza', sku: 'BEB-021', stock: 38, price: 8500 },
];

const ORDER_STATUS_MAPPING: StatusMapping = {
  PENDING_PAGO: { label: 'Pendiente de pago', tone: 'warning', pulse: true },
  PAGADO: { label: 'Pagado', tone: 'primary' },
  COOKING: { label: 'En cocina', tone: 'warning', pulse: true },
  READY: { label: 'Listo', tone: 'success' },
  ENTREGADO: { label: 'Entregado', tone: 'neutral' },
  CANCELADO: { label: 'Cancelado', tone: 'danger' },
};

export default function StyleguidePage() {
  const startedAtRecent = new Date(Date.now() - 3 * 60 * 1000); // 3 min
  const startedAtWarning = new Date(Date.now() - 8 * 60 * 1000); // 8 min
  const startedAtDanger = new Date(Date.now() - 12 * 60 * 1000); // 12 min

  return (
    <div className="min-h-dvh bg-background">
      <PageHeader
        eyebrow="Design system"
        title="Styleguide"
        description="Galería viva de los widgets de @pos-tercos/ui + identidad de marca."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Styleguide' }]}
        actions={
          <a
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            ← Volver al admin
          </a>
        }
      />

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-10 sm:px-6 lg:px-8">
        <Section
          title="1 · Marca"
          description="Logos en sus tres variantes y íconos custom de marca."
        >
          <Subsection title="BrandLogo">
            <div className="grid gap-6 sm:grid-cols-3">
              <BrandTile label='variant="full"'>
                <BrandLogo variant="full" theme="light" size="h-12" />
              </BrandTile>
              <BrandTile label='variant="mark"'>
                <BrandLogo variant="mark" theme="light" size="h-14" />
              </BrandTile>
              <BrandTile label='variant="wordmark"'>
                <BrandLogo variant="wordmark" theme="light" size="h-12" />
              </BrandTile>
            </div>
            <div className="mt-3 grid gap-6 sm:grid-cols-3">
              <BrandTile label="full · sobre dark" tone="dark">
                <BrandLogo variant="full" theme="dark" size="h-12" />
              </BrandTile>
              <BrandTile label="mark · sobre dark" tone="dark">
                <BrandLogo variant="mark" theme="dark" size="h-14" />
              </BrandTile>
              <BrandTile label="wordmark · sobre dark" tone="dark">
                <BrandLogo variant="wordmark" theme="dark" size="h-12" />
              </BrandTile>
            </div>
          </Subsection>

          <Subsection title="BrandIcon · stroke 1.75 · currentColor">
            <div className="flex flex-wrap items-end gap-6">
              {(['burger', 'knife', 'flame', 'steam', 'apron'] as const).map((name) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <BrandIcon name={name} className="h-8 w-8 text-foreground" />
                  <span className="caps text-[0.625rem] text-muted-foreground">{name}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-1.5">
                <BrandIcon name="flame" className="h-8 w-8 text-primary" />
                <span className="caps text-[0.625rem] text-muted-foreground">flame · primary</span>
              </div>
            </div>
          </Subsection>

          <Subsection title="LineArtIllustration · empty states / errores">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  'empty-plate',
                  'empty-cart',
                  'no-results',
                  'broken-burger',
                  'closed-shift',
                ] as const
              ).map((name) => (
                <div
                  key={name}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-4"
                >
                  <LineArtIllustration name={name} className="h-24 w-auto text-ink-400" />
                  <span className="caps text-[0.625rem] text-muted-foreground">{name}</span>
                </div>
              ))}
            </div>
          </Subsection>
        </Section>

        <Section title="2 · Color · paleta cerrada">
          <Subsection title="Primary · ROJO TIZÓN saturado (red-50 → red-950)">
            <ColorScale
              colors={[
                ['red-50', '#FFE5E8'],
                ['red-100', '#FFB8C0'],
                ['red-200', '#FF8893'],
                ['red-300', '#FF5867'],
                ['red-400', '#F2384A'],
                ['red-500', '#E5293E'],
                ['red-600', '#CB1E32'],
                ['red-700', '#A91824'],
                ['red-800', '#821218'],
                ['red-900', '#5C0D11'],
                ['red-950', '#3A080B'],
              ]}
              utility="bg-red"
            />
          </Subsection>
          <Subsection title="Neutros · grafito azulado · ink (50 → 950, con 850)">
            <ColorScale
              colors={[
                ['ink-50', '#F1F5FA'],
                ['ink-100', '#DEE5EE'],
                ['ink-200', '#BFC9D6'],
                ['ink-300', '#94A0B0'],
                ['ink-400', '#6E7A8C'],
                ['ink-500', '#525D6E'],
                ['ink-600', '#3B4453'],
                ['ink-700', '#2C3340'],
                ['ink-800', '#232A36'],
                ['ink-850', '#1D232E'],
                ['ink-900', '#181D26'],
                ['ink-950', '#131822'],
              ]}
              utility="bg-ink"
            />
          </Subsection>
          <Subsection title="Tonos funcionales">
            <div className="flex flex-wrap gap-3">
              <SwatchBlock
                label="success"
                hex="#4ADE80"
                className="bg-success"
                textClass="text-ink-950"
              />
              <SwatchBlock
                label="warning"
                hex="#FBBF24"
                className="bg-warning"
                textClass="text-ink-950"
              />
              <SwatchBlock
                label="destructive"
                hex="#E5293E · = primary"
                className="bg-destructive"
              />
            </div>
          </Subsection>
        </Section>

        <Section title="3 · Tipografía">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">Display · Big Shoulders</p>
              <p className="font-display text-6xl font-extrabold tracking-tight text-foreground">
                LISTO
              </p>
            </div>
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">H1</p>
              <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
                Hamburguesería Tercos
              </h1>
            </div>
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">H2</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Pedido #042
              </h2>
            </div>
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">Body · Inter 400</p>
              <p className="text-base text-foreground">
                Pedidos en cocina con cronómetro, cobro rápido en mostrador, gestión de inventario,
                facturas con IA, reportes de ventas y reconciliación anti-fraude.
              </p>
            </div>
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">Body small · Inter 400</p>
              <p className="text-sm text-muted-foreground">
                Texto secundario para descripciones y celdas de tablas.
              </p>
            </div>
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">Caps · sistema</p>
              <p className="caps text-xs text-foreground">Cierre de turno</p>
            </div>
            <div>
              <p className="caps text-[0.625rem] text-muted-foreground">Tabular nums</p>
              <p className="tabular text-2xl font-semibold text-foreground">
                $1.234.567 · 18:42:31
              </p>
            </div>
          </div>
        </Section>

        <Section title="4 · Buttons">
          <Subsection title="Variants">
            <div className="flex flex-wrap gap-3">
              <Button>Default · primary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="success">Success (KDS)</Button>
            </div>
          </Subsection>
          <Subsection title="Sizes">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="xl">XL · POS/KDS tap</Button>
            </div>
          </Subsection>
          <Subsection title="States">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>
                Outline disabled
              </Button>
            </div>
          </Subsection>
          <Subsection title="IconButton + ButtonGroup">
            <div className="flex flex-wrap items-center gap-4">
              <IconButton aria-label="Favorito" tooltip="Favorito">
                <Star />
              </IconButton>
              <IconButton aria-label="Eliminar" variant="destructive">
                <Trash />
              </IconButton>
              <IconButton aria-label="Editar" variant="ghost">
                <Pencil />
              </IconButton>
              <ButtonGroup>
                <Button variant="outline">Hoy</Button>
                <Button variant="outline">Semana</Button>
                <Button variant="outline">Mes</Button>
              </ButtonGroup>
            </div>
          </Subsection>
        </Section>

        <Section title="5 · Badges, Chips, ConnectionDot">
          <Subsection title="Badge · subtle">
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Neutral</Badge>
              <Badge tone="primary">Primary</Badge>
              <Badge tone="success">Listo</Badge>
              <Badge tone="warning">En cocina</Badge>
              <Badge tone="danger">Anulada</Badge>
              <Badge tone="info">Info</Badge>
              <Badge tone="success" withDot>
                Turno abierto
              </Badge>
            </div>
          </Subsection>
          <Subsection title="Badge · solid">
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary" variant="solid">
                Primary
              </Badge>
              <Badge tone="success" variant="solid">
                Success
              </Badge>
              <Badge tone="warning" variant="solid">
                Warning
              </Badge>
              <Badge tone="danger" variant="solid">
                Danger
              </Badge>
            </div>
          </Subsection>
          <Subsection title="StatusBadge · estados de pedido">
            <div className="flex flex-wrap gap-2">
              {Object.keys(ORDER_STATUS_MAPPING).map((s) => (
                <StatusBadge key={s} status={s} mapping={ORDER_STATUS_MAPPING} />
              ))}
            </div>
          </Subsection>
          <Subsection title="Chip · seleccionables">
            <div className="flex flex-wrap gap-2">
              <Chip selected>Hamburguesas</Chip>
              <Chip>Bebidas</Chip>
              <Chip>Papas</Chip>
              <Chip onRemove={() => {}}>Sin cebolla</Chip>
            </div>
          </Subsection>
          <Subsection title="ConnectionDot">
            <div className="flex flex-wrap items-center gap-5">
              <ConnectionDot state="live" label="En vivo" />
              <ConnectionDot state="connecting" label="Reconectando" />
              <ConnectionDot state="error" label="Sin conexión" />
              <ConnectionDot state="idle" label="Inactivo" />
            </div>
          </Subsection>
        </Section>

        <Section title="6 · Datos · StatCard, EmptyState, Skeleton, DataTable">
          <Subsection title="StatCard">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Ventas hoy"
                value={<Money amount={1234500} size="3xl" weight="bold" />}
                delta={15.6}
                deltaLabel="vs ayer"
                icon={<BrandIcon name="flame" className="h-5 w-5" />}
                tone="primary"
              />
              <StatCard
                label="Ticket promedio"
                value={<Money amount={28400} size="3xl" weight="bold" />}
                delta={-3.2}
                deltaLabel="vs ayer"
                tone="neutral"
              />
              <StatCard
                label="Pedidos en cocina"
                value="7"
                hint="3 en preparación"
                tone="warning"
                icon={<BrandIcon name="steam" className="h-5 w-5" />}
              />
              <StatCard
                label="Stock crítico"
                value="4"
                hint="ítems debajo del mínimo"
                tone="danger"
              />
            </div>
          </Subsection>
          <Subsection title="LoadingSkeleton">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="caps mb-2 text-[0.625rem] text-muted-foreground">text x 3</p>
                <LoadingSkeleton shape="text" count={3} />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="caps mb-2 text-[0.625rem] text-muted-foreground">card</p>
                <LoadingSkeleton shape="card" />
              </div>
            </div>
          </Subsection>
          <Subsection title="EmptyState">
            <EmptyState
              illustration={<LineArtIllustration name="empty-plate" />}
              title="No hay pedidos en cocina"
              description="Cuando entre el primer pedido del turno, aparecerá aquí con su cronómetro."
              action={<Button>Ver pedidos web</Button>}
            />
          </Subsection>
          <Subsection title="DataTable">
            <DataTable
              rows={SAMPLE_ROWS}
              rowKey={(r) => r.id}
              columns={[
                { key: 'name', header: 'Producto', cell: (r) => r.name },
                {
                  key: 'sku',
                  header: 'SKU',
                  cell: (r) => <span className="text-muted-foreground">{r.sku}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'stock',
                  header: 'Stock',
                  align: 'right',
                  numeric: true,
                  cell: (r) =>
                    r.stock < 10 ? (
                      <Badge tone="warning" size="sm">
                        {r.stock}
                      </Badge>
                    ) : (
                      <Quantity value={r.stock} />
                    ),
                },
                {
                  key: 'price',
                  header: 'Precio',
                  align: 'right',
                  numeric: true,
                  cell: (r) => <Money amount={r.price} weight="semibold" />,
                },
              ]}
              emptyState={<EmptyState title="Sin productos" size="sm" />}
              onRowClick={() => {}}
            />
          </Subsection>
        </Section>

        <Section title="7 · Money, Quantity, Percentage, Countdown">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PreviewCard label="Money sm">
              <Money amount={2500} />
            </PreviewCard>
            <PreviewCard label="Money 2xl bold">
              <Money amount={1234500} size="2xl" weight="bold" />
            </PreviewCard>
            <PreviewCard label="Money con sign">
              <Money amount={4800} size="lg" weight="semibold" withSign />
            </PreviewCard>
            <PreviewCard label="Money negativo">
              <Money amount={-1500} size="lg" weight="semibold" />
            </PreviewCard>
            <PreviewCard label="Quantity con unidad">
              <Quantity value={1500} unit="g" />
            </PreviewCard>
            <PreviewCard label="Percentage tonal +">
              <Percentage value={15.6} withSign tonal />
            </PreviewCard>
            <PreviewCard label="Percentage tonal −">
              <Percentage value={-3.2} withSign tonal />
            </PreviewCard>
            <PreviewCard label="Countdown · 3 min">
              <Countdown startedAt={startedAtRecent} className="text-2xl font-display" />
            </PreviewCard>
            <PreviewCard label="Countdown · 8 min (warning)">
              <Countdown startedAt={startedAtWarning} className="text-2xl font-display" />
            </PreviewCard>
            <PreviewCard label="Countdown · 12 min (danger)">
              <Countdown startedAt={startedAtDanger} className="text-2xl font-display" />
            </PreviewCard>
          </div>
        </Section>

        <Section title="8 · Forms">
          <StyleguideClientDemos />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="border-b border-border pb-3">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="caps text-[0.625rem] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function BrandTile({
  label,
  children,
  tone = 'light',
}: {
  label: string;
  children: React.ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border p-6 ${
        tone === 'dark'
          ? 'border-ink-800 bg-ink-950 text-ink-50'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex h-20 items-center justify-center">{children}</div>
      <p className="caps text-[0.625rem] opacity-70">{label}</p>
    </div>
  );
}

function ColorScale({
  colors,
  utility,
}: {
  colors: [string, string][];
  utility: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 lg:grid-cols-12">
      {colors.map(([name, hex]) => {
        const stop = name.split('-')[1];
        const numericStop = Number(stop);
        const isLightSwatch = numericStop <= 300;
        const labelClass = isLightSwatch ? 'text-ink-950' : 'text-ink-50';
        return (
          <div
            key={name}
            className={`${utility}-${stop} flex h-16 flex-col justify-end rounded-md p-1.5 ${labelClass}`}
          >
            <span className="text-[0.625rem] font-semibold">{stop}</span>
            <span className="text-[0.5625rem] opacity-80">{hex}</span>
          </div>
        );
      })}
    </div>
  );
}

function SwatchBlock({
  label,
  hex,
  className,
  textClass = 'text-ink-50',
}: {
  label: string;
  hex: string;
  className: string;
  textClass?: string;
}) {
  return (
    <div
      className={`flex h-20 w-40 flex-col justify-end rounded-md p-2 ${textClass} ${className}`}
    >
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[0.625rem] opacity-80">{hex}</span>
    </div>
  );
}

function PreviewCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <span className="caps text-[0.625rem] text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

// Íconos lucide-style inline (para no requerir lucide-react aquí)
function Star() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}
function Trash() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
function Pencil() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

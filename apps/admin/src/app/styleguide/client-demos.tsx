'use client';

import * as React from 'react';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DateRangeInput,
  Dialog,
  Drawer,
  FileDropzone,
  FormField,
  Input,
  NumberInput,
  Popover,
  RadioGroup,
  SearchInput,
  Select,
  Switch,
  Textarea,
  Tooltip,
  ToastProvider,
  useToast,
} from '@pos-tercos/ui';

/**
 * Demos de widgets que requieren estado/interacción. Wrapped en `<ToastProvider>`
 * para poder disparar toasts desde el demo.
 */
export function StyleguideClientDemos() {
  return (
    <ToastProvider>
      <Demos />
    </ToastProvider>
  );
}

function Demos() {
  const { toast } = useToast();

  const [text, setText] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [textarea, setTextarea] = React.useState('');
  const [select, setSelect] = React.useState('hamburguesas');
  const [number, setNumber] = React.useState<number | null>(28000);
  const [qty, setQty] = React.useState<number | null>(150);
  const [from, setFrom] = React.useState('2026-05-01');
  const [to, setTo] = React.useState('2026-05-04');
  const [check, setCheck] = React.useState(true);
  const [switchOn, setSwitchOn] = React.useState(true);
  const [radio, setRadio] = React.useState('pickup');
  const [emailErr, setEmailErr] = React.useState('');

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <div className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-2">
        <FormField
          label="Email"
          hint="Te llegará el ticket aquí"
          error={emailErr || undefined}
          required
        >
          <Input
            type="email"
            placeholder="tu@email.com"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setEmailErr(
                e.target.value && !e.target.value.includes('@')
                  ? 'Ingresa un email válido'
                  : '',
              );
            }}
          />
        </FormField>

        <FormField label="Buscar productos">
          <SearchInput
            placeholder="Buscar…"
            shortcut="/"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </FormField>

        <FormField label="Notas del pedido">
          <Textarea
            value={textarea}
            onChange={(e) => setTextarea(e.target.value)}
            placeholder="Sin cebolla, salsa aparte…"
          />
        </FormField>

        <FormField label="Categoría">
          <Select value={select} onChange={(e) => setSelect(e.target.value)}>
            <option value="hamburguesas">Hamburguesas</option>
            <option value="bebidas">Bebidas</option>
            <option value="papas">Papas</option>
          </Select>
        </FormField>

        <FormField label="Precio de venta">
          <NumberInput value={number} onChange={setNumber} prefix="$" min={0} />
        </FormField>

        <FormField label="Cantidad por porción" hint="En gramos">
          <NumberInput value={qty} onChange={setQty} suffix="g" decimals={0} min={0} />
        </FormField>

        <FormField label="Rango de fechas (reportes)">
          <DateRangeInput
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
          />
        </FormField>

        <FormField label="Tipo de entrega">
          <RadioGroup
            name="entrega"
            value={radio}
            onChange={setRadio}
            options={[
              { value: 'pickup', label: 'Recoger en tienda', description: 'Sin costo de envío' },
              { value: 'delivery', label: 'Domicilio', description: 'Hasta 3 km · $4.000' },
            ]}
          />
        </FormField>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Checkbox
          label="Aceptar términos y condiciones"
          description="Necesario para procesar el pedido."
          checked={check}
          onChange={(e) => setCheck(e.target.checked)}
        />
        <Switch
          label="Pedidos web habilitados"
          description="Si está OFF, el menú web muestra cerrado."
          checked={switchOn}
          onChange={(e) => setSwitchOn(e.target.checked)}
        />
      </div>

      <FileDropzone
        accept="image/*,application/pdf"
        maxSizeBytes={5 * 1024 * 1024}
        onFilesSelected={(files) =>
          toast({
            title: 'Archivos recibidos',
            description: `${files.length} archivo(s) — ${files[0].name}`,
            tone: 'success',
          })
        }
        onError={(message) => toast({ title: 'Error de archivo', description: message, tone: 'error' })}
        prompt="Arrastra una factura o haz clic"
        hint="JPG, PNG o PDF. Máximo 5MB."
      />

      <div className="space-y-2">
        <p className="caps text-[0.625rem] text-muted-foreground">Overlays</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setDialogOpen(true)}>Abrir Dialog</Button>
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            Abrir Drawer
          </Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Confirmar destructivo
          </Button>

          <Tooltip content="Tooltip simple con delay">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>

          <Popover trigger={<Button variant="outline">Popover ▾</Button>}>
            <ul className="py-1">
              {['Editar', 'Duplicar', 'Eliminar'].map((label) => (
                <li key={label}>
                  <button className="w-full px-4 py-2 text-left text-sm hover:bg-muted">
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <p className="caps text-[0.625rem] text-muted-foreground">Toasts</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="success"
            onClick={() =>
              toast({ title: 'Pedido confirmado', description: '#042 enviado a cocina', tone: 'success' })
            }
          >
            Success toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast({ title: 'Reconectando…', tone: 'warning' })}
          >
            Warning toast
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              toast({
                title: 'Error al cobrar',
                description: 'La pasarela rechazó la transacción.',
                tone: 'error',
              })
            }
          >
            Error toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast({
                title: 'Promoción aplicada',
                tone: 'info',
                action: { label: 'Deshacer', onClick: () => {} },
              })
            }
          >
            Info toast con acción
          </Button>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Cobrar pedido #042"
        description="Confirma el método de pago y el monto recibido."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Cobrar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Método de pago">
            <Select defaultValue="efectivo">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="nequi">Nequi</option>
            </Select>
          </FormField>
          <FormField label="Monto recibido">
            <NumberInput value={number} onChange={setNumber} prefix="$" />
          </FormField>
        </div>
      </Dialog>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="Pedidos web pendientes"
      >
        <Drawer.Header
          title="Pedidos web"
          subtitle="3 pendientes de confirmación"
          onClose={() => setDrawerOpen(false)}
        />
        <Drawer.Body>
          <ul className="space-y-2">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="rounded-lg border border-border bg-card p-3 text-sm"
              >
                <p className="font-semibold">Pedido web #{100 + n}</p>
                <p className="text-xs text-muted-foreground">
                  Pickup · 2 ítems · esperando confirmación
                </p>
              </li>
            ))}
          </ul>
        </Drawer.Body>
        <Drawer.Footer>
          <Button className="w-full">Confirmar todos</Button>
        </Drawer.Footer>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast({ title: 'Eliminado', tone: 'success' });
        }}
        title="¿Anular esta venta?"
        description="Esta acción es irreversible y queda registrada en el audit log."
        confirmLabel="Sí, anular"
        destructive
      />
    </div>
  );
}

'use client';

import { Button, cn } from '@pos-tercos/ui';
import type { ExtractedInvoice, InvoiceDraftResponse, Stockable, Supplier } from '@pos-tercos/types';
import { FilePlus2, Loader2, Sparkles, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listStock } from '../../inventory';
import { discardPhoto, uploadInvoicePhoto } from '../api/client';
import { listSuppliers } from '../utils/suppliers-api';
import { InvoiceConfirmModal } from './InvoiceConfirmModal';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

/** Draft sintético en memoria — NO persiste en DB hasta que el usuario confirme. */
function buildSyntheticDraft(
  extraction: ExtractedInvoice,
  aiModelUsed: string,
): InvoiceDraftResponse {
  const now = new Date().toISOString();
  return {
    invoice: {
      id: '00000000-0000-0000-0000-000000000000', // sentinel; nunca se envía al confirmar
      supplierId: null,
      supplierName: null,
      invoiceNumber: extraction.invoiceNumber,
      total: extraction.total,
      iva: extraction.iva,
      photoStorageKey: null,
      aiModelUsed,
      status: 'PENDING_REVIEW',
      uploadedById: null,
      uploadedByName: null,
      confirmedById: null,
      confirmedByName: null,
      confirmedAt: null,
      notes: null,
      paymentStatus: null,
      paidAt: null,
      hasPaymentProof: false,
      paymentActorId: null,
      paymentActorName: null,
      paymentNote: null,
      paymentPocket: null,
      paymentCashAmount: null,
      paymentBankAmount: null,
      createdAt: now,
      updatedAt: now,
      items: [],
    },
    extraction,
  };
}

// Sin warnings: el modal muestra la guía de 3 pasos (ManualEntryGuide) en modo manual.
const EMPTY_EXTRACTION: ExtractedInvoice = {
  supplierName: null,
  supplierNit: null,
  invoiceNumber: null,
  total: null,
  iva: null,
  items: [],
  warnings: [],
};

export function InvoiceUploader() {
  const [draft, setDraft] = useState<InvoiceDraftResponse | null>(null);
  const [manualMode, setManualMode] = useState(false);
  /** Si la sesión actual viene del flujo IA: foto en storage + modelo usado. */
  const [iaContext, setIaContext] = useState<{ photoStorageKey: string; aiModelUsed: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockables, setStockables] = useState<Stockable[]>([]);

  useEffect(() => {
    refreshLookups();
  }, []);

  const refreshLookups = (): void => {
    Promise.all([listSuppliers(), listStock({ onlyActive: true })])
      .then(([s, items]) => {
        setSuppliers(s);
        setStockables(items);
      })
      .catch(() => {});
  };

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setUploading(true);
    try {
      setManualMode(false);
      // upload-photo NO crea factura — solo devuelve la extracción + photoStorageKey.
      const res = await uploadInvoicePhoto(file);
      setIaContext({ photoStorageKey: res.photoStorageKey, aiModelUsed: res.aiModelUsed });
      setDraft(buildSyntheticDraft(res.extraction, res.aiModelUsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setUploading(false);
    }
  };

  /** No hace ninguna llamada al backend — abre el modal con un draft en memoria. */
  const handleManual = (): void => {
    setError(null);
    setManualMode(true);
    setIaContext(null);
    setDraft(buildSyntheticDraft(EMPTY_EXTRACTION, 'manual'));
  };

  const handleClose = (): void => {
    // Si veníamos de IA, limpiar la foto subida (no la queremos huérfana).
    if (iaContext) void discardPhoto(iaContext.photoStorageKey);
    setDraft(null);
    setManualMode(false);
    setIaContext(null);
  };
  const handleConfirmed = (): void => {
    setDraft(null);
    setManualMode(false);
    setIaContext(null);
    refreshLookups();
  };

  return (
    <div className="space-y-6">
      {uploading ? (
        <AILoadingCard />
      ) : (
        <>
          {/* Opción principal: foto + IA */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-colors',
              dragOver
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/50',
            )}
          >
            <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" strokeWidth={2} /> Recomendado
            </span>
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
            <Upload
              className={cn('h-10 w-10', dragOver ? 'text-primary' : 'text-muted-foreground')}
              strokeWidth={1.5}
            />
            <p className="mt-3 text-base font-semibold text-foreground">
              Subir foto y dejar que la IA lo haga
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Arrastra una foto de la factura o toca para elegir. La IA detecta proveedor, items,
              cantidades y precios. JPG, PNG, WebP o GIF — hasta 10 MB.
            </p>
          </label>

          {/* Separador con opción manual */}
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">o</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {!uploading && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/20 p-4 text-center">
          <p className="text-sm text-foreground">
            ¿Sin foto o la IA no extrae bien? Carga la factura manualmente.
          </p>
          <Button variant="outline" onClick={handleManual}>
            <FilePlus2 className="h-4 w-4" strokeWidth={1.75} />
            Cargar manualmente
          </Button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* Cómo funciona — paso a paso en color neutro, no rojo agresivo */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="caps text-[0.6875rem] text-muted-foreground">Cómo funciona</p>
        <ol className="mt-3 space-y-3 text-sm">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-foreground">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {draft && (
        <InvoiceConfirmModal
          draft={draft}
          manualMode={manualMode}
          iaContext={iaContext ?? undefined}
          suppliers={suppliers}
          stockables={stockables}
          onClose={handleClose}
          onConfirmed={handleConfirmed}
          onStockableCreated={(item) =>
            setStockables((prev) =>
              [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
        />
      )}
    </div>
  );
}

const STEPS = [
  'Subes foto (IA) o inicias una carga manual.',
  'Si fue por foto, la IA extrae proveedor, items, cantidades y precios.',
  'En la ventana asocias cada línea con un Insumo o Producto de reventa, o creas uno nuevo.',
  'Confirmas → el sistema suma al inventario y guarda el historial.',
];

/** Estados que se rotan mientras la IA procesa la foto (rotan cada ~1.8s). */
const AI_STAGES = [
  'Subiendo la foto…',
  'Analizando la imagen con IA…',
  'Detectando proveedor e items…',
  'Reconociendo cantidades y precios…',
  'Calculando totales…',
  'Preparando vista para revisar…',
];

/** Card de carga grande con spinner y mensajes que rotan, en lugar del dropzone. */
function AILoadingCard() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % AI_STAGES.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-primary/40 bg-primary/5 p-12 text-center"
    >
      {/* Barra indeterminada superior */}
      <div className="absolute left-0 right-0 top-0 h-1 overflow-hidden bg-primary/10">
        <div className="h-full w-1/3 animate-[ai-loader-bar_1.4s_ease-in-out_infinite] bg-primary" />
      </div>

      {/* Icono central con spinner + sparkles pulsantes */}
      <div className="relative">
        <Loader2 className="h-14 w-14 animate-spin text-primary" strokeWidth={1.5} />
        <Sparkles
          className="absolute -right-2 -top-2 h-5 w-5 animate-pulse text-primary"
          strokeWidth={2}
        />
      </div>

      <p className="mt-5 text-lg font-semibold text-foreground">
        La IA está leyendo tu factura
      </p>
      <p
        key={stage}
        className="mt-2 animate-[fade-in_0.4s_ease-out] text-sm text-muted-foreground"
      >
        {AI_STAGES[stage]}
      </p>
      <p className="mt-6 text-[11px] text-muted-foreground">
        Suele tomar entre 5 y 15 segundos. No cierres la ventana.
      </p>

      {/* Keyframes inline (Tailwind no los trae) */}
      <style>{`
        @keyframes ai-loader-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

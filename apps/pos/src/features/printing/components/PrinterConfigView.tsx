'use client';

import { Button, Card, Checkbox } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { listAgentPrinters, type AgentPrinters } from '../api/agent';
import {
  getPrinterConfig,
  savePrinterConfig,
  PRINT_DOC_TYPES,
  PRINT_DOC_LABELS,
  type PrintDocType,
  type PrinterConfig,
} from '../lib/printer-config';

/**
 * Configura, por terminal, qué imprime cada impresora. Detecta las impresoras
 * del print-agent local y permite asignar a cada una: comanda de cocina (sin
 * bebidas), comanda completa y/o factura del cliente. Se guarda en esta PC.
 */
export function PrinterConfigView() {
  const [agent, setAgent] = useState<AgentPrinters | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PrinterConfig>({ printers: [] });
  const [saved, setSaved] = useState(false);

  const loadPrinters = () => {
    setLoading(true);
    setLoadError(null);
    listAgentPrinters()
      .then(setAgent)
      .catch((e) => setLoadError(getErrorMessage(e, 'No se pudo leer las impresoras')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setConfig(getPrinterConfig());
    loadPrinters();
  }, []);

  // Unión de impresoras detectadas + las que ya estén en la config (por si
  // una quedó desconectada pero no querés perder su asignación).
  const names = Array.from(
    new Set([...(agent?.printers ?? []), ...config.printers.map((p) => p.name)]),
  );

  const docsFor = (name: string): PrintDocType[] =>
    config.printers.find((p) => p.name === name)?.docs ?? [];

  const toggle = (name: string, doc: PrintDocType) => {
    setSaved(false);
    setConfig((prev) => {
      const printers = [...prev.printers];
      const idx = printers.findIndex((p) => p.name === name);
      if (idx === -1) {
        printers.push({ name, docs: [doc] });
      } else {
        const has = printers[idx].docs.includes(doc);
        printers[idx] = {
          name,
          docs: has
            ? printers[idx].docs.filter((d) => d !== doc)
            : [...printers[idx].docs, doc],
        };
      }
      return { printers };
    });
  };

  const save = () => {
    savePrinterConfig(config);
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Impresoras de esta terminal</p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? 'Buscando impresoras…'
                : agent
                  ? `${agent.printers.length} detectada(s) · plataforma ${agent.platform}`
                  : 'Sin conexión con el print-agent'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadPrinters} disabled={loading}>
            Recargar
          </Button>
        </div>
        {loadError ? (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </p>
        ) : null}
      </Card>

      {names.length === 0 && !loading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No se detectaron impresoras. Verificá que el print-agent esté corriendo
          en esta PC y que las impresoras estén instaladas en Windows.
        </Card>
      ) : null}

      {names.map((name) => {
        const selected = docsFor(name);
        const detected = agent?.printers.includes(name) ?? false;
        return (
          <Card key={name} className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{name}</span>
              {!detected ? (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                  no detectada
                </span>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRINT_DOC_TYPES.map((doc) => (
                <label
                  key={doc}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-xs"
                >
                  <Checkbox
                    checked={selected.includes(doc)}
                    onChange={() => toggle(name, doc)}
                  />
                  <span>{PRINT_DOC_LABELS[doc]}</span>
                </label>
              ))}
            </div>
          </Card>
        );
      })}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={loading}>
          Guardar configuración
        </Button>
        {saved ? <span className="text-xs text-emerald-600">Guardado ✓</span> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Si no asignás ninguna impresora, el sistema imprime todo en la impresora
        por defecto del print-agent (comportamiento anterior).
      </p>
    </div>
  );
}

'use client';

import { Input, Label } from '@pos-tercos/ui';
import type { Supplier } from '@pos-tercos/types';

type SupplierMode = 'existing' | 'new';

interface SupplierSectionProps {
  supplierMode: SupplierMode;
  onSupplierModeChange: (mode: SupplierMode) => void;
  supplierId: string;
  onSupplierIdChange: (id: string) => void;
  newSupplierNit: string;
  onNewSupplierNitChange: (v: string) => void;
  newSupplierName: string;
  onNewSupplierNameChange: (v: string) => void;
  matchedSupplier: Supplier | null;
  suppliers: Supplier[];
  disabled?: boolean;
}

export function SupplierSection({
  supplierMode,
  onSupplierModeChange,
  supplierId,
  onSupplierIdChange,
  newSupplierNit,
  onNewSupplierNitChange,
  newSupplierName,
  onNewSupplierNameChange,
  matchedSupplier,
  suppliers,
  disabled,
}: SupplierSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <header><h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Proveedor</h3></header>

      <div className="flex gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="supplierMode" checked={supplierMode === 'existing'} onChange={() => onSupplierModeChange('existing')} disabled={disabled} className="h-4 w-4 text-primary focus:ring-ring" />
          Existente
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="supplierMode" checked={supplierMode === 'new'} onChange={() => onSupplierModeChange('new')} disabled={disabled} className="h-4 w-4 text-primary focus:ring-ring" />
          Nuevo
        </label>
        {matchedSupplier && supplierMode === 'existing' && (
          <span className="text-xs text-success">✓ Matcheado por NIT con &ldquo;{matchedSupplier.name}&rdquo;</span>
        )}
      </div>

      {supplierMode === 'existing' ? (
        <div className="space-y-1.5">
          <Label htmlFor="supplierId">Seleccionar proveedor</Label>
          <select id="supplierId" value={supplierId} onChange={(e) => onSupplierIdChange(e.target.value)} disabled={disabled} className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">— Seleccionar —</option>
            {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.nit})</option>))}
          </select>
          {suppliers.length === 0 && (<p className="text-xs text-warning">No hay proveedores cargados. Cambiá a &quot;Nuevo&quot; para crear uno.</p>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="newSupplierNit">NIT</Label>
            <Input id="newSupplierNit" required disabled={disabled} value={newSupplierNit} onChange={(e) => onNewSupplierNitChange(e.target.value)} placeholder="900.123.456-7" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newSupplierName">Nombre</Label>
            <Input id="newSupplierName" required disabled={disabled} value={newSupplierName} onChange={(e) => onNewSupplierNameChange(e.target.value)} placeholder="Distribuidora XX SA" />
          </div>
          <p className="col-span-full text-xs text-muted-foreground">Si el NIT ya existe, el sistema lo reutiliza automáticamente.</p>
        </div>
      )}
    </section>
  );
}

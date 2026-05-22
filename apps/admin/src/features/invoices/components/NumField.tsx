'use client';

import { Input, Label } from '@pos-tercos/ui';

function parseNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface NumFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function NumField({ id, label, value, onChange, disabled }: NumFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(parseNum(e.target.value))}
      />
    </div>
  );
}

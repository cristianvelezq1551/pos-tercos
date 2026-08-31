import * as React from 'react';
import { cn } from '../lib/utils';
import { Label } from './label';

export interface FormFieldProps {
  /** Label visible. Si se omite, no renderiza Label (raro — preferir always). */
  label?: React.ReactNode;
  /** Children = el control (Input, Select, Textarea, NumberInput, etc.). */
  children: React.ReactElement<{
    id?: string;
    'aria-invalid'?: boolean | 'true' | 'false';
    'aria-describedby'?: string;
  }>;
  /** id del control. Si no se pasa, se genera. Inyectado en el child. */
  htmlFor?: string;
  /** Texto de ayuda persistente debajo del input. */
  hint?: React.ReactNode;
  /** Mensaje de error. Si está, override del hint y marca el control inválido. */
  error?: React.ReactNode;
  /** Marca con asterisco. Default false. */
  required?: boolean;
  /** Slot opcional a la derecha del label (link "Olvidé mi password", etc.). */
  labelTrailing?: React.ReactNode;
  className?: string;
}

/**
 * Wrapper canónico para TODA forma. Encadena Label + control + (hint | error).
 * Inyecta automáticamente `id`, `aria-invalid`, `aria-describedby` en el child.
 *
 * Uso:
 *   <FormField label="Email" hint="Te llegará el ticket aquí" error={error}>
 *     <Input type="email" value={...} onChange={...} />
 *   </FormField>
 */
export function FormField({
  label,
  children,
  htmlFor,
  hint,
  error,
  required = false,
  labelTrailing,
  className,
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = htmlFor ?? children.props.id ?? `ff-${generatedId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = error ? errorId : hint ? hintId : undefined;

  const child = React.cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={id}>
            {label}
            {required ? (
              <span className="ml-0.5 text-primary" aria-hidden="true">
                *
              </span>
            ) : null}
          </Label>
          {labelTrailing ? <span className="text-xs">{labelTrailing}</span> : null}
        </div>
      ) : null}
      {child}
      {error ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
FormField.displayName = 'FormField';

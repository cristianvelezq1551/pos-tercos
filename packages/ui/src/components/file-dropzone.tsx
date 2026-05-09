'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface FileDropzoneProps {
  /** MIME types aceptados (ej: `'image/*,application/pdf'`). */
  accept?: string;
  /** Acepta múltiples archivos. */
  multiple?: boolean;
  /** Tamaño máximo por archivo en bytes. Si lo excede, dispara onError. */
  maxSizeBytes?: number;
  /** Callback con la lista de archivos seleccionados. */
  onFilesSelected: (files: File[]) => void;
  /** Callback con un mensaje de error legible. */
  onError?: (message: string) => void;
  /** Texto personalizado del prompt. Default: "Arrastrá un archivo o hacé clic para seleccionar". */
  prompt?: React.ReactNode;
  /** Hint debajo del prompt. */
  hint?: React.ReactNode;
  /** Estado disabled. */
  disabled?: boolean;
  className?: string;
}

/**
 * Dropzone unificado: drag & drop + click. Reemplaza dropzones inline en
 * `InvoiceUploader` y `ProductForm.ImageUploadField`.
 */
export const FileDropzone = React.forwardRef<HTMLDivElement, FileDropzoneProps>(
  (
    {
      accept,
      multiple = false,
      maxSizeBytes,
      onFilesSelected,
      onError,
      prompt = 'Arrastrá un archivo o hacé clic para seleccionar',
      hint,
      disabled = false,
      className,
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const handleFiles = (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const list = Array.from(files);
      if (maxSizeBytes != null) {
        const tooBig = list.find((f) => f.size > maxSizeBytes);
        if (tooBig) {
          onError?.(`"${tooBig.name}" excede el tamaño máximo permitido.`);
          return;
        }
      }
      onFilesSelected(list);
    };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-muted/20 px-6 py-10 text-center transition-colors duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isDragging
            ? 'border-primary bg-red-50'
            : 'border-border hover:border-ink-300 hover:bg-muted/40',
          disabled && 'cursor-not-allowed opacity-50',
          'motion-reduce:transition-none',
          className,
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />
        <svg
          aria-hidden="true"
          className="h-8 w-8 text-ink-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
        <p className="text-sm font-medium text-foreground">{prompt}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    );
  },
);
FileDropzone.displayName = 'FileDropzone';

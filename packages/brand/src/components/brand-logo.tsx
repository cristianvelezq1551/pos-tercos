import { cn } from '@pos-tercos/ui';
import type { CSSProperties } from 'react';

export type BrandLogoVariant = 'full' | 'mark' | 'wordmark';
export type BrandLogoTheme = 'light' | 'dark';

export interface BrandLogoProps {
  /** `mark` = sticker; `wordmark` = "Terco's" en script cursivo; `full` = mark + wordmark. */
  variant?: BrandLogoVariant;
  /**
   * `dark` (default) usa las versiones blancas — visibles sobre fondos oscuros.
   * `light` usa las versiones oscuras — para fondos claros.
   */
  theme?: BrandLogoTheme;
  className?: string;
  /** Alto en clases tailwind. */
  size?: string;
  /** Texto de aria-label. Default "Terco's". */
  label?: string;
}

/**
 * Logo de marca Terco's.
 *
 * - `mark` = sticker autoadhesivo monocromático (ilustración).
 * - `wordmark` = logotipo cursivo "Terco's".
 *
 * Las apps consumidoras deben exponer en `public/brand/`:
 * - `logo-tercos.svg` / `logo-tercos-white.svg` (sticker negro / blanco)
 * - `wordmark-tercos-dark.png` / `wordmark-tercos-white.png` (cursivo oscuro / blanco)
 */
export function BrandLogo({
  variant = 'full',
  theme = 'dark',
  className,
  size = 'h-8',
  label = "Terco's",
}: BrandLogoProps) {
  if (variant === 'wordmark') {
    return <Wordmark size={size} className={className} label={label} theme={theme} />;
  }

  if (variant === 'mark') {
    return <Mark size={size} className={className} label={label} theme={theme} />;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark size={size} label={label} theme={theme} />
      <Wordmark size={size} label={label} theme={theme} />
    </span>
  );
}

/** Logotipo cursivo "Terco's" (imagen). Blanco para fondo oscuro, oscuro para claro. */
function Wordmark({
  size,
  className,
  label,
  theme,
}: {
  size?: string;
  className?: string;
  label: string;
  theme: BrandLogoTheme;
}) {
  const src =
    theme === 'dark'
      ? '/brand/wordmark-tercos-white.png'
      : '/brand/wordmark-tercos-dark.png';
  // Ratio intrínseco del asset (846×240) → evita salto de layout al cargar.
  const style: CSSProperties = { aspectRatio: '846 / 240' };
  return (
    <img
      src={src}
      alt={label}
      style={style}
      className={cn('inline-block w-auto select-none', size, className)}
      draggable={false}
    />
  );
}

function Mark({
  size,
  className,
  label,
  theme,
}: {
  size?: string;
  className?: string;
  label: string;
  theme: BrandLogoTheme;
}) {
  const src =
    theme === 'dark' ? '/brand/logo-tercos-white.svg' : '/brand/logo-tercos.svg';
  const style: CSSProperties = { aspectRatio: '1 / 1' };
  return (
    <img
      src={src}
      alt={label}
      style={style}
      className={cn('inline-block w-auto select-none', size, className)}
      draggable={false}
    />
  );
}

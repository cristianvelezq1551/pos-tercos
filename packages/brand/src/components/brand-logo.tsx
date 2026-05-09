import { cn } from '@pos-tercos/ui';
import type { CSSProperties } from 'react';

export type BrandLogoVariant = 'full' | 'mark' | 'wordmark';
export type BrandLogoTheme = 'light' | 'dark';

export interface BrandLogoProps {
  /** `mark` = sticker; `wordmark` = "TERCOS" en display font; `full` = mark + wordmark. */
  variant?: BrandLogoVariant;
  /**
   * `dark` (default) usa la versión blanca del sticker — visible sobre fondos oscuros.
   * `light` usa el sticker negro original.
   */
  theme?: BrandLogoTheme;
  className?: string;
  /** Alto en clases tailwind. */
  size?: string;
  /** Texto de aria-label. Default "Tercos". */
  label?: string;
}

/**
 * Logo de marca Tercos. Sticker autoadhesivo monocromático.
 *
 * Las apps consumidoras deben exponer:
 * - `/brand/logo-tercos.svg` (versión negra original)
 * - `/brand/logo-tercos-white.svg` (versión blanca para fondo oscuro)
 */
export function BrandLogo({
  variant = 'full',
  theme = 'dark',
  className,
  size = 'h-8',
  label = 'Tercos',
}: BrandLogoProps) {
  const wordmarkColor =
    theme === 'dark' ? 'text-foreground' : 'text-ink-950';

  if (variant === 'wordmark') {
    return (
      <span
        aria-label={label}
        className={cn(
          'font-display font-extrabold uppercase leading-none tracking-[0.04em]',
          wordmarkColor,
          'text-[1.5em]',
          className,
        )}
      >
        Tercos
      </span>
    );
  }

  if (variant === 'mark') {
    return <Mark size={size} className={className} label={label} theme={theme} />;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark size={size} label={label} theme={theme} />
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-extrabold uppercase leading-none tracking-[0.04em]',
          wordmarkColor,
          'text-[1.45em]',
        )}
      >
        Tercos
      </span>
    </span>
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

import { cn } from '@pos-tercos/ui';
import type { SVGProps } from 'react';

export type BrandIconName = 'burger' | 'knife' | 'flame' | 'steam' | 'apron';

export interface BrandIconProps extends SVGProps<SVGSVGElement> {
  name: BrandIconName;
  /** Px o clase tailwind. Default `h-5 w-5`. */
  className?: string;
}

const STROKE = 1.75;

/**
 * Set chico de íconos custom de marca. Trazo 1.75 (sintoniza con el peso del
 * line-art del logo). Color via `currentColor` — pintar con `text-*`.
 */
export function BrandIcon({ name, className, ...rest }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('inline-block h-5 w-5 shrink-0', className)}
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}

const ICONS: Record<BrandIconName, React.ReactNode> = {
  burger: (
    <>
      {/* Bun superior */}
      <path d="M3.5 10.5c0-3.6 3.8-6.5 8.5-6.5s8.5 2.9 8.5 6.5" />
      {/* Semillitas de ajonjolí */}
      <path d="M8 8.4v.01M12 7.4v.01M16 8.4v.01" />
      {/* Lechuga (línea ondulada) */}
      <path d="M2.5 13.2c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2" />
      {/* Carne / divisor */}
      <path d="M3 16h18" />
      {/* Bun inferior */}
      <path d="M3 18.5c0 .8.7 1.5 1.5 1.5h15c.8 0 1.5-.7 1.5-1.5v-.5H3v.5z" />
    </>
  ),
  knife: (
    <>
      {/* Hoja de cuchillo */}
      <path d="M3 14 L17 4 c1.5 0 3 1 3 3 L9 17z" />
      {/* Cacha */}
      <path d="M9 17 L4.5 21.5 a2 2 0 0 1 -2.8 -2.8 L6 14" />
      {/* Reborde de la hoja */}
      <path d="M5 16 L13 8" opacity="0.55" />
    </>
  ),
  flame: (
    <>
      {/* Llama principal */}
      <path d="M12 22c-3.5 0-6-2.4-6-5.6 0-2.5 1.6-4 2.8-5.4.7-.8 1.4-1.6 1.4-2.6 0 1.5 1 2.6 2 3.6 1.5 1.5 3.8 3 3.8 6 0 2.7-1.7 4-4 4z" />
      {/* Llama interior */}
      <path d="M12 18.5c-1.4 0-2.4-1-2.4-2.3 0-1 .6-1.6 1.2-2.2.4-.4.8-.9.8-1.5.5.9 1.4 1.6 2 2.5.4.6.8 1.2.8 2 0 1-.7 1.5-2.4 1.5z" opacity="0.55" />
    </>
  ),
  steam: (
    <>
      {/* Tres ondas de vapor */}
      <path d="M7 18c0-2 2-2 2-4s-2-2-2-4" />
      <path d="M12 18c0-2 2-2 2-4s-2-2-2-4" />
      <path d="M17 18c0-2 2-2 2-4s-2-2-2-4" />
      {/* Base / olla */}
      <path d="M4 21h16" opacity="0.55" />
    </>
  ),
  apron: (
    <>
      {/* Tirante */}
      <path d="M9 4 L8 7" />
      <path d="M15 4 L16 7" />
      {/* Cuerpo del delantal */}
      <path d="M6 7h12v11a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7z" />
      {/* Bolsillo */}
      <path d="M9 13h6" opacity="0.55" />
    </>
  ),
};

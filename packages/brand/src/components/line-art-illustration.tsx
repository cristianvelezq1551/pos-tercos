import { cn } from '@pos-tercos/ui';
import type { SVGProps } from 'react';

export type IllustrationName =
  | 'empty-plate' // sin pedidos / sin productos
  | 'empty-cart' // carrito vacío
  | 'no-results' // search vacío
  | 'broken-burger' // error 500 / desconexión
  | 'closed-shift' // turno cerrado
  | 'burger'; // hamburguesa entera (fallback de thumbs)

export interface LineArtIllustrationProps extends SVGProps<SVGSVGElement> {
  name: IllustrationName;
  className?: string;
}

const STROKE = 1.5;

/**
 * Ilustraciones line-art para empty-states y error pages. Estilo coherente
 * con el logo (trazo 1.5, currentColor, sin relleno). Pintar con `text-*`.
 */
export function LineArtIllustration({ name, className, ...rest }: LineArtIllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('h-32 w-auto text-ink-300', className)}
      {...rest}
    >
      {ILLUSTRATIONS[name]}
    </svg>
  );
}

const ILLUSTRATIONS: Record<IllustrationName, React.ReactNode> = {
  'empty-plate': (
    <>
      {/* Plato visto de frente */}
      <ellipse cx="100" cy="100" rx="60" ry="14" />
      <ellipse cx="100" cy="98" rx="48" ry="9" opacity="0.5" />
      {/* Sombra debajo */}
      <path d="M55 122c10 4 30 6 45 6s35-2 45-6" opacity="0.4" />
      {/* Cubiertos cruzados arriba */}
      <path d="M70 50 L80 90" />
      <path d="M73 50 L72 60 M77 50 L78 60" />
      <path d="M130 50 L120 90" />
      <path d="M125 50 c0 5 10 5 10 0 v15 c0 4 -10 4 -10 0z" />
    </>
  ),
  'empty-cart': (
    <>
      {/* Bolsa de delivery */}
      <path d="M65 60 h70 l-6 70 a8 8 0 0 1 -8 8 H79 a8 8 0 0 1 -8 -8 z" />
      {/* Asas */}
      <path d="M82 60 v-12 a18 18 0 0 1 36 0 v12" />
      {/* Etiqueta */}
      <rect x="85" y="85" width="30" height="20" rx="2" opacity="0.55" />
      <path d="M91 95 h18" opacity="0.55" />
    </>
  ),
  'no-results': (
    <>
      {/* Lupa */}
      <circle cx="88" cy="80" r="32" />
      <circle cx="88" cy="80" r="22" opacity="0.4" />
      <path d="M112 104 L140 132" strokeWidth="3" />
      {/* Cuchillo cruzado dentro */}
      <path d="M75 67 L101 93" opacity="0.55" />
      <path d="M101 67 L75 93" opacity="0.55" />
    </>
  ),
  'broken-burger': (
    <>
      {/* Bun roto en dos */}
      <path d="M40 70 q20 -30 50 -30 l-5 30 z" />
      <path d="M115 70 q-5 -30 35 -30 q15 0 20 30 z" />
      {/* Ingredientes desparramados */}
      <path d="M40 78 h130" />
      <path d="M50 86 q15 -8 30 0 t30 0 t30 0 t30 0" opacity="0.6" />
      {/* Bun inferior partido */}
      <path d="M40 95 h60 l5 18 z" />
      <path d="M115 95 h45 l-3 18 z" />
      {/* Gota cayendo */}
      <path d="M105 100 q-2 6 0 10 q2 -4 0 -10z" opacity="0.55" />
    </>
  ),
  'closed-shift': (
    <>
      {/* Persiana cerrada */}
      <path d="M40 40 h120" strokeWidth="3" />
      <path d="M40 40 v90" />
      <path d="M160 40 v90" />
      <path d="M40 130 h120" strokeWidth="3" />
      {/* Líneas horizontales de la persiana */}
      <path d="M48 55 h104" opacity="0.5" />
      <path d="M48 70 h104" opacity="0.5" />
      <path d="M48 85 h104" opacity="0.5" />
      <path d="M48 100 h104" opacity="0.5" />
      <path d="M48 115 h104" opacity="0.5" />
      {/* Candado abajo */}
      <rect x="92" y="125" width="16" height="14" rx="2" />
      <path d="M96 125 v-4 a4 4 0 0 1 8 0 v4" />
    </>
  ),
  burger: (
    <>
      {/* Pan superior */}
      <path d="M40 80 q0 -40 60 -40 t60 40 z" />
      {/* Sésamo */}
      <path d="M75 60 l5 -3" opacity="0.7" />
      <path d="M95 52 l5 -2" opacity="0.7" />
      <path d="M118 55 l5 -2" opacity="0.7" />
      <path d="M83 70 l4 -2" opacity="0.55" />
      <path d="M108 65 l4 -1" opacity="0.55" />
      {/* Lechuga (onda) */}
      <path d="M40 84 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" />
      {/* Carne / patty */}
      <path d="M44 95 h112" strokeWidth="3" />
      {/* Queso (esquinas onduladas) */}
      <path d="M48 102 q8 4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" opacity="0.65" />
      {/* Pan inferior */}
      <path d="M44 108 q0 22 56 22 t56 -22 z" />
    </>
  ),
};

'use client';

import { useEffect } from 'react';

/** Reintentos hasta que el contenido termine de montar (~1 s a 60 fps). */
const MAX_FRAMES = 60;

function scrollToHash(): void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  let frames = 0;
  const tick = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      return;
    }
    if (frames++ < MAX_FRAMES) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Salta a la sección del ancla (#id). El navegador no lo hace solo acá por dos
 * motivos que se suman: el contenedor con scroll es el `main` del shell (no el
 * documento), y la página llega en streaming — cuando el navegador intenta el
 * salto, la sección todavía no existe y no reintenta. Sin esto, un resultado
 * del buscador aterriza al principio del capítulo: en "Caja: vender" la sección
 * de cortesías quedaba 5.500 px más abajo.
 *
 * El offset bajo la barra superior lo pone `scroll-mt-24` en cada sección.
 */
export function HashScroller() {
  useEffect(() => {
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);
  return null;
}

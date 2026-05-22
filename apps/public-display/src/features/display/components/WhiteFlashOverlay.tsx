'use client';

import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * Flash blanco full-screen que dispara cuando cambia `currentTurn`.
 * Spec del .pen webTurno (sección 1d): opacity 0 → 0.04 → 0 en 200 ms.
 * Apenas perceptible — solo da un sutil "click visual" al cambio.
 */
export function WhiteFlashOverlay({ value }: { value: number }) {
  const controls = useAnimation();
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = value;
      return;
    }
    if (prevRef.current === value) return;
    prevRef.current = value;
    void controls.start({
      opacity: [0, 0.04, 0],
      transition: { duration: 0.2, times: [0, 0.3, 1], ease: 'easeOut' },
    });
  }, [value, controls]);

  return (
    <motion.div
      animate={controls}
      initial={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-[100] bg-white"
    />
  );
}

'use client';

import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * Flash blanco full-screen que dispara en cada llamado (`trigger` = callSeq,
 * monotónico). Re-flashea aunque el número no cambie (re-llamado).
 * Spec del .pen webTurno (sección 1d): opacity 0 → 0.04 → 0 en 200 ms.
 * Apenas perceptible — solo da un sutil "click visual" al cambio.
 */
export function WhiteFlashOverlay({ trigger }: { trigger: number }) {
  const controls = useAnimation();
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = trigger;
      return;
    }
    if (prevRef.current === trigger) return;
    prevRef.current = trigger;
    void controls.start({
      opacity: [0, 0.04, 0],
      transition: { duration: 0.2, times: [0, 0.3, 1], ease: 'easeOut' },
    });
  }, [trigger, controls]);

  return (
    <motion.div
      animate={controls}
      initial={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-[100] bg-white"
    />
  );
}

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ComboPromoSlide } from './slides/ComboPromoSlide';
import { HeroComboSlide } from './slides/HeroComboSlide';
import { SpotlightSlide } from './slides/SpotlightSlide';

const VIEW_DURATION_MS = 10_000;
const TURN_PAUSE_MS = 5_000;
const TICK_MS = 500;

interface SlideEntry {
  key: string;
  render: () => ReactNode;
}

const SLIDES: SlideEntry[] = [
  { key: 'hero', render: () => <HeroComboSlide /> },
  { key: 'combo', render: () => <ComboPromoSlide /> },
  { key: 'spotlight', render: () => <SpotlightSlide /> },
];

/**
 * Estado del ciclo a nivel MÓDULO — sobrevive a re-mounts del componente
 * (Strict Mode, HMR, re-renders del padre). Esa era la causa del "contador
 * se reinicia al cambiar turno": cualquier re-mount perdía el `useRef`.
 */
let moduleIndex = 0;
let moduleLastAdvance = Date.now();
let modulePausedUntil = 0;

const slideVariants = {
  enter: { opacity: 0, filter: 'blur(14px) brightness(0.25)' },
  center: {
    opacity: 1,
    filter: 'blur(0px) brightness(1)',
    transition: {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    filter: 'blur(14px) brightness(0.3)',
    transition: { duration: 0.9, ease: 'easeIn' as const },
  },
};

export function Carousel({
  trigger,
  hasTurn,
}: {
  trigger: number;
  hasTurn: boolean;
}) {
  const [index, setIndex] = useState(moduleIndex);
  const turnRef = useRef<number | null>(null);

  // Pausa solo ante un llamado real (callSeq sube + hay turno). Evita pausar
  // en reset/reinicio del server.
  useEffect(() => {
    const prev = turnRef.current;
    turnRef.current = trigger;
    if (prev === null) return;
    if (trigger <= prev || !hasTurn) return;
    modulePausedUntil = Date.now() + TURN_PAUSE_MS;
  }, [trigger, hasTurn]);

  // Tick cada 500 ms — condicional. Solo avanza si:
  //  1) Pasaron ≥ 10 s desde el último avance (moduleLastAdvance es módulo,
  //     no se reinicia con re-mount).
  //  2) Estamos fuera de la ventana de pausa.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (now < modulePausedUntil) return;
      if (now - moduleLastAdvance < VIEW_DURATION_MS) return;
      moduleLastAdvance = now;
      moduleIndex = (moduleIndex + 1) % SLIDES.length;
      setIndex(moduleIndex);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[index];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.key}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0"
          style={{ willChange: 'opacity, filter' }}
        >
          {slide.render()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

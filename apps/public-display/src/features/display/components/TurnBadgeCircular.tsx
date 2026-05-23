'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Turn Badge circular bottom-right. Inspirado en `.pen` webTurno (componente
 * `N0WD29`) pero con sizes responsive (`clamp` por vh) en lugar de pixel
 * fixed para adaptarse a cualquier resolución.
 *
 * Layout:
 *  - 3 anillos concéntricos en cascada (12% → 4.5% → 0% inset).
 *  - Círculo principal con backdrop-blur + border rojo translúcido.
 *  - Contenido (label "TURNO" + número) centrado con flex.
 *  - Glow rojo sutil en box-shadow.
 *
 * Animaciones (framer-motion): 3D flip, badge scale pulse, ring pulse staggered.
 */

const flipVariants = {
  enter: { rotateX: -90, opacity: 0, scale: 0.8 },
  center: {
    rotateX: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 20,
      mass: 0.8,
    },
  },
  exit: {
    rotateX: 90,
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.3, ease: 'easeIn' as const },
  },
};

const badgePulse = {
  scale: [1, 1.15, 1],
  transition: {
    duration: 0.6,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    times: [0, 0.4, 1] as [number, number, number],
  },
};

function RingPulse({ active }: { active: boolean }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: i === 0 ? 0 : i === 1 ? '3.5%' : '7%',
            border: '2px solid #FF3B30',
            opacity: 0,
            filter: `blur(${4 + i * 3}px)`,
          }}
          animate={
            active
              ? {
                  scale: [1, 1.3 + i * 0.15, 1],
                  opacity: [0.6, 0, 0.6],
                }
              : { scale: 1, opacity: 0 }
          }
          transition={{
            duration: 1.2,
            delay: i * 0.15,
            ease: 'easeOut',
            repeat: active ? 1 : 0,
          }}
        />
      ))}
    </>
  );
}

export function TurnBadgeCircular({
  value,
  trigger,
}: {
  value: number | null;
  trigger: number;
}) {
  const [changed, setChanged] = useState(false);
  const prevRef = useRef<number | null>(null);

  // Animar en cada llamado (trigger = callSeq) — incluido re-llamar el mismo
  // número, donde `value` no cambia pero `trigger` sí.
  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = trigger;
      return;
    }
    if (prevRef.current === trigger) return;
    prevRef.current = trigger;
    setChanged(true);
    const id = setTimeout(() => setChanged(false), 1500);
    return () => clearTimeout(id);
  }, [trigger]);

  return (
    <motion.div
      className="absolute"
      style={{
        right: '2vw',
        bottom: '3vh',
        width: 'clamp(340px, 48vh, 540px)',
        height: 'clamp(340px, 48vh, 540px)',
        perspective: 800,
        zIndex: 30,
      }}
      animate={changed ? badgePulse : { scale: 1 }}
    >
      {/* Anillos decorativos rojos — quedan AFUERA del círculo principal
          para no teñir el interior. */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ border: '1.5px solid rgba(255, 59, 48, 0.18)' }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: '4%',
          border: '1px solid rgba(255, 59, 48, 0.12)',
        }}
      />

      {/* Pulse rings on change */}
      <RingPulse active={changed} />

      {/* Círculo principal — NEGRO 40% opacidad (60% transparente).
          Border blanco translúcido (NO rojo) para evitar vinotinto.
          Box-shadow solo profundidad, sin glow rojo interno. */}
      <div
        className="absolute rounded-full"
        style={{
          inset: '8%',
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1.5px solid rgba(255, 255, 255, 0.08)',
          boxShadow: changed
            ? '0 12px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
          transition: 'box-shadow 400ms ease-out',
        }}
      />

      {/* Contenido centrado dentro del círculo principal */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ inset: '8%', gap: '1.5%' }}
      >
        <div
          className="font-extrabold uppercase turn-text-glow"
          style={{
            color: '#FF3B30',
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(15px, 2.4vh, 26px)',
            fontWeight: 800,
            letterSpacing: '0.45em',
            paddingLeft: '0.45em',
            lineHeight: 1,
          }}
        >
          TURNO
        </div>
        <div
          className="overflow-visible"
          style={{ transformStyle: 'preserve-3d', lineHeight: 1 }}
        >
          <AnimatePresence mode="popLayout">
            <motion.div
              key={value ?? 'none'}
              variants={flipVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'hidden',
                fontFamily: 'Inter, sans-serif',
                fontSize: 'clamp(140px, 28vh, 290px)',
                fontWeight: 900,
                color: '#FFFFFF',
                lineHeight: 0.95,
                letterSpacing: '-0.04em',
                filter:
                  'drop-shadow(0 4px 12px rgba(0,0,0,0.7)) drop-shadow(0 0 24px rgba(0,0,0,0.5))',
              }}
              className="tabular"
            >
              {value ?? '—'}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

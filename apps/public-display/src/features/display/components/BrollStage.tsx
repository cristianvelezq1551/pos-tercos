'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { BROLL_MENU, BROLL_SOCIAL } from '../lib/broll-menu';

/**
 * Fondo de marketing del turnero — réplica fiel de la señalética TERCOS-WEB
 * (`index.html`): columna izquierda con marca + producto + redes sobre negro,
 * columna derecha con la foto del plato a alto completo con Ken Burns.
 *
 * Rota un producto a la vez del menú real (`broll-menu.ts`). El turno + flash
 * + campana se superponen encima (ver `Display`).
 */

const VIEW_DURATION_MS = 8_000;
const TURN_PAUSE_MS = 5_000;
const TICK_MS = 500;

// Estado del ciclo a nivel MÓDULO — sobrevive a re-mounts (Strict Mode, HMR,
// re-render del padre cuando cambia el turno). Mismo patrón que el Carousel viejo.
let moduleIndex = 0;
let moduleLastAdvance = Date.now();
let modulePausedUntil = 0;

const infoEntrance = {
  hidden: { opacity: 0, y: 26, filter: 'blur(4px)' },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      delay: 0.1 + i * 0.13,
      duration: 0.8,
      ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number],
    },
  }),
};

export function BrollStage({
  trigger,
  hasTurn,
}: {
  trigger: number;
  hasTurn: boolean;
}) {
  const [index, setIndex] = useState(moduleIndex);

  // Pausa la rotación ante un llamado real (callSeq sube + hay turno), para que
  // el cliente alcance a leer su número sin que el plato cambie debajo.
  useEffect(() => {
    if (!hasTurn) return;
    modulePausedUntil = Date.now() + TURN_PAUSE_MS;
  }, [trigger, hasTurn]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (now < modulePausedUntil) return;
      if (now - moduleLastAdvance < VIEW_DURATION_MS) return;
      moduleLastAdvance = now;
      moduleIndex = (moduleIndex + 1) % BROLL_MENU.length;
      setIndex(moduleIndex);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const item = BROLL_MENU[index];

  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_auto] overflow-hidden bg-black">
      {/* ── Columna izquierda: marca + producto + redes ── */}
      <div
        className="z-[4] flex flex-col"
        style={{ padding: '3vh 3vw 3.5vh 4.5vw' }}
      >
        {/* Header de marca */}
        <div
          className="flex items-center justify-between"
          style={{ gap: '2vw', maxWidth: '46vw' }}
        >
          <div className="flex flex-col">
            <Image
              src="/broll-tercos/logo_text.png"
              alt="Terco's"
              width={420}
              height={140}
              priority
              className="w-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              style={{ height: '8vh' }}
            />
            <div
              className="font-display uppercase text-accent"
              style={{ fontSize: '1vw', letterSpacing: '0.32em', marginTop: '1.1vh' }}
            >
              {BROLL_SOCIAL.subtag}
            </div>
          </div>
          <Image
            src="/broll-tercos/mascotaT.png"
            alt="Terco's"
            width={180}
            height={180}
            priority
            className="w-auto shrink-0"
            style={{ height: '10vh' }}
          />
        </div>

        {/* Producto (rota) */}
        <div
          className="flex flex-1 flex-col items-start justify-center"
          style={{ maxWidth: '50vw', gap: '2.2vh' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              className="flex flex-col items-start"
              style={{ gap: '2.2vh' }}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
            >
              <motion.div custom={0} variants={infoEntrance}>
                <span
                  className="inline-flex font-bold uppercase text-text-white"
                  style={{ fontSize: '2.4vw', letterSpacing: '0.18em' }}
                >
                  <span
                    className="bg-accent"
                    style={{
                      padding: '0.5vw 1.5vw 0.65vw',
                      borderRadius: '10px',
                      boxShadow: '5px 5px 0 rgba(0,0,0,.5)',
                    }}
                  >
                    {item.tag.toUpperCase()}
                  </span>
                </span>
              </motion.div>

              <motion.h1
                custom={1}
                variants={infoEntrance}
                className="font-display uppercase text-text-white"
                style={{
                  fontSize: '8vw',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  textShadow:
                    '0 3px 0 var(--color-accent-deep), 0 10px 30px rgba(0,0,0,.7)',
                }}
              >
                {item.name}
              </motion.h1>

              <motion.p
                custom={2}
                variants={infoEntrance}
                className="font-medium text-text-muted"
                style={{ fontSize: '1.85vw', maxWidth: '40vw', lineHeight: 1.35 }}
              >
                {item.desc}
              </motion.p>

              <motion.div custom={3} variants={infoEntrance}>
                <span
                  className="inline-block font-display text-text-white"
                  style={{
                    fontSize: '5.4vw',
                    background: 'var(--color-accent)',
                    padding: '0.1vw 1.7vw 0.5vw',
                    borderRadius: '14px',
                    transform: 'rotate(-2deg)',
                    boxShadow: '7px 8px 0 rgba(0,0,0,.55)',
                    border: '3px solid #fff',
                  }}
                >
                  {item.price}
                </span>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Redes */}
        <div
          className="flex flex-nowrap items-center font-display uppercase text-text-white"
          style={{ gap: '2vw', fontSize: '1.25vw', letterSpacing: '0.04em' }}
        >
          <span className="whitespace-nowrap">
            <b className="font-normal text-accent" style={{ marginRight: '0.4vw' }}>
              TikTok
            </b>
            {BROLL_SOCIAL.tiktok}
          </span>
          <span className="text-accent opacity-70">★</span>
          <span className="whitespace-nowrap">
            <b className="font-normal text-accent" style={{ marginRight: '0.4vw' }}>
              Instagram
            </b>
            {BROLL_SOCIAL.instagram}
          </span>
          <span className="text-accent opacity-70">★</span>
          <span className="whitespace-nowrap">
            <b className="font-normal text-accent" style={{ marginRight: '0.4vw' }}>
              WhatsApp
            </b>
            {BROLL_SOCIAL.whatsapp}
          </span>
        </div>
      </div>

      {/* ── Columna derecha: la comida protagonista, full alto ── */}
      <div className="flex items-stretch justify-end">
        <div
          className="relative h-dvh overflow-hidden bg-black"
          style={{ width: '44vw' }}
        >
          <AnimatePresence>
            <motion.div
              key={index}
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${item.img}')` }}
              initial={{ opacity: 0, scale: 1.07 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: {
                  opacity: { duration: 1.1, ease: 'easeOut' },
                  scale: { duration: VIEW_DURATION_MS / 1000, ease: 'easeOut' },
                },
              }}
              exit={{ opacity: 0, transition: { duration: 0.8 } }}
            />
          </AnimatePresence>
          {/* Difuminado del borde izquierdo: oculta la costura con el panel negro. */}
          <div
            className="pointer-events-none absolute inset-0 z-[3]"
            style={{
              background:
                'linear-gradient(90deg,#000 0%, #000 6%, rgba(0,0,0,.5) 14%, rgba(0,0,0,0) 30%)',
              boxShadow: 'inset 0 0 60px 14px rgba(0,0,0,.5)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

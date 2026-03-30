'use client';

/**
 * /mirror — AI-Kart Live AR Mirror
 *
 * The flagship real-time virtual try-on experience.
 * Uses the existing ar-engine (Engine.ts) which handles:
 *   Camera → MediaPipe Pose → Garment Overlay → Canvas
 *
 * This page provides the luxury Maison Noir UI wrapper:
 *   - Full-viewport canvas (the Engine draws camera + overlay onto it)
 *   - Cinematic loading sequence
 *   - Garment carousel with gold-accent selection
 *   - State management for engine lifecycle
 *
 * Target audience: Prada CDO standing in front of a screen.
 * Standard: They smile. That is success.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Engine, type EngineState } from '@/ar-engine/Engine';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════
   GARMENT CATALOG — MIRROR COLLECTION
   Luxury naming convention, real assets from /garments/canonical/
   ══════════════════════════════════════════════════════════════ */

interface MirrorGarment {
  readonly id: string;
  readonly name: string;
  readonly maison: string;
  readonly url: string;
  readonly category: string;
}

const MIRROR_GARMENTS: readonly MirrorGarment[] = [
  {
    id: 'noir-blazer',
    name: 'Noir Blazer',
    maison: 'Structured Wool',
    url: '/garments/mirror/blazer_noir.svg',
    category: 'Tailoring',
  },
  {
    id: 'blanc-tee',
    name: 'Blanc Essentiel',
    maison: 'Egyptian Cotton',
    url: '/garments/mirror/tee_blanc.svg',
    category: 'Essentials',
  },
  {
    id: 'ivoire-knit',
    name: 'Ivoire Maille',
    maison: 'Cashmere Blend',
    url: '/garments/mirror/sweater_ivoire.svg',
    category: 'Knitwear',
  },
  {
    id: 'atelier-hood',
    name: 'Atelier Hood',
    maison: 'French Terry',
    url: '/garments/mirror/hoodie_atelier.svg',
    category: 'Casual Luxe',
  },
  {
    id: 'noir-longue',
    name: 'Noir Longue',
    maison: 'Stretch Jersey',
    url: '/garments/mirror/longsleeve_noir.svg',
    category: 'Essentials',
  },
  {
    id: 'marine-polo',
    name: 'Marine Polo',
    maison: 'Piqué Cotton',
    url: '/garments/mirror/polo_marine.svg',
    category: 'Essentials',
  },
] as const;

/* ══════════════════════════════════════════════════════════════
   ANIMATION VARIANTS — Cinematic, not bouncy
   Uses --ease-gold: cubic-bezier(0.16, 1, 0.3, 1)
   ══════════════════════════════════════════════════════════════ */

const EASE_GOLD: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeVariant = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8, ease: EASE_GOLD } },
  exit: { opacity: 0, transition: { duration: 0.6, ease: EASE_GOLD } },
};

const slideUpVariant = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_GOLD } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.4, ease: EASE_GOLD } },
};

const toastVariant = {
  hidden: { opacity: 0, y: -16, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: EASE_GOLD },
  },
  exit: {
    opacity: 0,
    y: -12,
    filter: 'blur(4px)',
    transition: { duration: 0.4, ease: EASE_GOLD },
  },
};

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════════ */

/** Cinematic loading overlay — thin gold scan line + status text */
function LoadingOverlay({ message }: { message: string }) {
  return (
    <motion.div
      key="loading"
      variants={fadeVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute inset-0 z-40 flex flex-col items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      {/* Wordmark */}
      <motion.p
        initial={{ opacity: 0, letterSpacing: '0.3em' }}
        animate={{ opacity: 1, letterSpacing: '0.5em' }}
        transition={{ duration: 1.2, ease: EASE_GOLD }}
        className="text-xs tracking-[0.5em] uppercase mb-10"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}
      >
        AI-Kart
      </motion.p>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: EASE_GOLD }}
        className="text-4xl md:text-5xl font-medium mb-8"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}
      >
        Mirror
      </motion.h1>

      {/* Gold scan line */}
      <div className="relative w-48 h-px mb-10 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 h-full"
          style={{ background: 'var(--gold-gradient)' }}
          initial={{ width: '0%' }}
          animate={{ width: ['0%', '100%', '100%', '0%'], x: ['0%', '0%', '0%', '100%'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'var(--border-subtle)', height: 1 }}
        />
      </div>

      {/* Status text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="text-sm"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}
      >
        {message}
      </motion.p>
    </motion.div>
  );
}

/** Graceful error overlay */
function ErrorOverlay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <motion.div
      key="error"
      variants={fadeVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_GOLD }}
        className="flex flex-col items-center text-center px-8 py-10 max-w-md"
        style={{
          background: 'var(--surface-container)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div
          className="w-14 h-14 flex items-center justify-center mb-6"
          style={{ border: '1px solid var(--border-gold)', color: 'var(--gold-dim)' }}
        >
          <Camera size={24} />
        </div>

        <h2
          className="text-xl font-medium mb-3"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}
        >
          Mirror Unavailable
        </h2>

        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}
        >
          {message}
        </p>

        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-300"
          style={{
            fontFamily: 'var(--font-sans)',
            color: 'var(--background)',
            background: 'var(--gold)',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget.style.background) = 'var(--gold-raw)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget.style.background) = 'var(--gold)';
          }}
        >
          <RotateCcw size={14} />
          Try Again
        </button>
      </motion.div>
    </motion.div>
  );
}

/** Garment selection toast — appears briefly when garment changes */
function GarmentToast({ garment }: { garment: MirrorGarment | null }) {
  return (
    <AnimatePresence mode="wait">
      {garment && (
        <motion.div
          key={garment.id}
          variants={toastVariant}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="absolute top-20 left-1/2 z-30 flex items-center gap-4 px-6 py-3 -translate-x-1/2"
          style={{
            background: 'var(--surface-glass)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border-gold)',
          }}
        >
          <Sparkles size={14} style={{ color: 'var(--gold)' }} />
          <div>
            <p
              className="text-sm font-medium"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--gold)' }}
            >
              {garment.name}
            </p>
            <p
              className="text-xs"
              style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}
            >
              {garment.maison}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Single garment card in the carousel */
function GarmentCard({
  garment,
  isSelected,
  isLoading,
  onSelect,
}: {
  garment: MirrorGarment;
  isSelected: boolean;
  isLoading: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.25, ease: EASE_GOLD }}
      className="flex-shrink-0 flex flex-col items-center gap-2 p-2 transition-colors duration-300 group relative"
      style={{
        background: isSelected ? 'var(--surface-high)' : 'transparent',
        border: isSelected
          ? '1px solid var(--border-gold-active)'
          : '1px solid transparent',
        outline: 'none',
        minWidth: 80,
      }}
      aria-label={`Select ${garment.name}`}
      aria-pressed={isSelected}
    >
      {/* Thumbnail */}
      <div
        className="relative w-16 h-20 md:w-20 md:h-24 overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--surface-container)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={garment.url}
          alt={garment.name}
          className="w-full h-full object-contain"
          style={{
            filter: isSelected ? 'brightness(1.1)' : 'brightness(0.85)',
            transition: 'filter 0.3s',
          }}
          loading="eager"
        />

        {/* Loading shimmer */}
        {isLoading && (
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(230,195,100,0.15) 50%, transparent 100%)',
            }}
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      {/* Label */}
      <div className="text-center">
        <p
          className="text-xs font-medium leading-tight"
          style={{
            color: isSelected ? 'var(--gold)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            transition: 'color 0.3s',
          }}
        >
          {garment.name}
        </p>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}
        >
          {garment.category}
        </p>
      </div>

      {/* Selected indicator — gold underline */}
      {isSelected && (
        <motion.div
          layoutId="garment-indicator"
          className="absolute bottom-0 left-2 right-2 h-px"
          style={{ background: 'var(--gold)' }}
          transition={{ duration: 0.35, ease: EASE_GOLD }}
        />
      )}
    </motion.button>
  );
}

/** Garment carousel strip */
function GarmentCarousel({
  garments,
  selectedId,
  loadingId,
  onSelect,
}: {
  garments: readonly MirrorGarment[];
  selectedId: string;
  loadingId: string | null;
  onSelect: (garment: MirrorGarment) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -200 : 200;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  }, []);

  return (
    <motion.div
      variants={slideUpVariant}
      initial="hidden"
      animate="visible"
      className="absolute bottom-0 left-0 right-0 z-30"
    >
      {/* Glass backdrop */}
      <div
        className="relative flex items-center gap-1 px-2 py-3 md:px-4 md:py-4"
        style={{
          background: 'linear-gradient(to top, rgba(24,17,23,0.92) 0%, rgba(24,17,23,0.7) 70%, transparent 100%)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center transition-opacity duration-200 hover:opacity-100 opacity-40"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Scroll left"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Scrollable garment row */}
        <div
          ref={scrollRef}
          className="flex-1 flex gap-1 md:gap-2 overflow-x-auto py-1"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {garments.map((g) => (
            <GarmentCard
              key={g.id}
              garment={g}
              isSelected={selectedId === g.id}
              isLoading={loadingId === g.id}
              onSelect={() => onSelect(g)}
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center transition-opacity duration-200 hover:opacity-100 opacity-40"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Scroll right"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN MIRROR PAGE
   ══════════════════════════════════════════════════════════════ */

type MirrorState = 'loading' | 'running' | 'error';

export default function MirrorPage() {
  /* ── Refs ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initAttemptRef = useRef(0);

  /* ── State ── */
  const [mirrorState, setMirrorState] = useState<MirrorState>('loading');
  const [statusMessage, setStatusMessage] = useState('Preparing camera…');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(MIRROR_GARMENTS[0].id);
  const [loadingGarmentId, setLoadingGarmentId] = useState<string | null>(null);
  const [toastGarment, setToastGarment] = useState<MirrorGarment | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fps, setFps] = useState(0);

  /* ── Toast auto-dismiss ── */
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((garment: MirrorGarment) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastGarment(garment);
    toastTimerRef.current = setTimeout(() => setToastGarment(null), 2200);
  }, []);

  /* ── FPS polling (only when debug on) ── */
  useEffect(() => {
    if (!showDebug || mirrorState !== 'running') return;
    const interval = setInterval(() => {
      if (engineRef.current) {
        setFps(engineRef.current.stats.fps);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [showDebug, mirrorState]);

  /* ── Engine Status Handler ── */
  const handleStatusChange = useCallback((state: EngineState, msg?: string) => {
    switch (state) {
      case 'initializing':
        setStatusMessage('Loading pose model…');
        break;
      case 'running':
        setMirrorState('running');
        break;
      case 'error':
        setMirrorState('error');
        setErrorMessage(
          msg?.includes('denied')
            ? 'Camera access is required for the mirror experience. Please allow camera permissions in your browser settings and try again.'
            : msg ?? 'An unexpected error occurred while initializing the mirror.'
        );
        break;
      case 'paused':
      case 'disposed':
        break;
    }
  }, []);

  /* ── Engine Init ── */
  const initEngine = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Dispose previous engine if exists
    if (engineRef.current) {
      try { engineRef.current.dispose(); } catch { /* safe */ }
      engineRef.current = null;
    }

    setMirrorState('loading');
    setStatusMessage('Preparing camera…');
    setErrorMessage('');

    const currentAttempt = ++initAttemptRef.current;

    const engine = new Engine({
      canvas,
      shirtUrl: MIRROR_GARMENTS[0].url,
      useMeshWarp: false,
      targetFPS: 30,
      showKeypoints: false,
      demoMode: true,
      devMode: true,
      onStatusChange: handleStatusChange,
    });

    engineRef.current = engine;

    engine
      .init()
      .then(() => {
        // Guard: only start if this is still the active attempt
        if (initAttemptRef.current !== currentAttempt) return;
        engine.start();
      })
      .catch((err: unknown) => {
        if (initAttemptRef.current !== currentAttempt) return;
        const message =
          err instanceof Error ? err.message : 'Failed to initialize mirror';
        setMirrorState('error');
        setErrorMessage(
          message.includes('denied')
            ? 'Camera access is required for the mirror experience. Please allow camera permissions in your browser settings and try again.'
            : message
        );
      });
  }, [handleStatusChange]);

  /* ── Mount / Unmount ── */
  useEffect(() => {
    // Small delay to ensure canvas is in the DOM
    const timer = setTimeout(initEngine, 100);

    return () => {
      clearTimeout(timer);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (engineRef.current) {
        try { engineRef.current.dispose(); } catch { /* safe */ }
        engineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Garment Change ── */
  const handleGarmentSelect = useCallback(
    async (garment: MirrorGarment) => {
      if (garment.id === selectedId) return;
      if (!engineRef.current || mirrorState !== 'running') return;

      setSelectedId(garment.id);
      setLoadingGarmentId(garment.id);
      showToast(garment);

      try {
        await engineRef.current.changeGarment(garment.url);
      } catch {
        // Engine handles fallback internally — no action needed
      } finally {
        setLoadingGarmentId(null);
      }
    },
    [selectedId, mirrorState, showToast]
  );

  /* ── Fullscreen Toggle ── */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ── Debug Toggle ── */
  const toggleDebug = useCallback(() => {
    setShowDebug((prev) => {
      const next = !prev;
      if (engineRef.current) {
        engineRef.current.showKeypoints = next;
      }
      return next;
    });
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') toggleDebug();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDebug, toggleFullscreen]);

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: 'var(--background)' }}
    >
      {/* ── CANVAS — The Mirror ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: 'cover',
          // Invisible until engine is running to avoid flash of blank canvas
          opacity: mirrorState === 'running' ? 1 : 0,
          transition: 'opacity 1s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      {/* ── Subtle vignette overlay for depth ── */}
      {mirrorState === 'running' && (
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 50%, rgba(24,17,23,0.4) 100%)',
          }}
        />
      )}

      {/* ── TOP BAR ── */}
      {mirrorState === 'running' && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE_GOLD }}
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-4"
          style={{
            background:
              'linear-gradient(to bottom, rgba(24,17,23,0.6) 0%, transparent 100%)',
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{ border: '1px solid var(--border-gold)', color: 'var(--gold)' }}
            >
              <Layers size={13} />
            </div>
            <div>
              <p
                className="text-xs tracking-[0.25em] uppercase leading-none"
                style={{
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--gold)',
                  fontWeight: 500,
                }}
              >
                AI-Kart
              </p>
              <p
                className="text-[10px] mt-0.5 italic"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--text-muted)',
                }}
              >
                Mirror
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* FPS badge (only when debug) */}
            {showDebug && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-3 py-1 text-xs font-mono"
                style={{
                  background: 'var(--surface-glass)',
                  color: fps >= 25 ? '#00ff88' : fps >= 15 ? '#ffaa00' : '#ff4444',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fps} FPS
              </motion.div>
            )}

            {/* Debug toggle */}
            <button
              onClick={toggleDebug}
              className="w-9 h-9 flex items-center justify-center transition-all duration-300"
              style={{
                background: showDebug ? 'var(--surface-high)' : 'var(--surface-glass)',
                border: showDebug
                  ? '1px solid var(--border-gold)'
                  : '1px solid transparent',
                color: showDebug ? 'var(--gold)' : 'var(--text-muted)',
              }}
              aria-label={showDebug ? 'Hide debug overlay' : 'Show debug overlay'}
              title="Toggle debug (D)"
            >
              {showDebug ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="w-9 h-9 flex items-center justify-center transition-all duration-300"
              style={{
                background: 'var(--surface-glass)',
                border: '1px solid transparent',
                color: 'var(--text-muted)',
              }}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </motion.div>
      )}

      {/* ── GARMENT TOAST ── */}
      <GarmentToast garment={toastGarment} />

      {/* ── STATE OVERLAYS ── */}
      <AnimatePresence mode="wait">
        {mirrorState === 'loading' && (
          <LoadingOverlay message={statusMessage} />
        )}
        {mirrorState === 'error' && (
          <ErrorOverlay message={errorMessage} onRetry={initEngine} />
        )}
      </AnimatePresence>

      {/* ── GARMENT CAROUSEL ── */}
      {mirrorState === 'running' && (
        <GarmentCarousel
          garments={MIRROR_GARMENTS}
          selectedId={selectedId}
          loadingId={loadingGarmentId}
          onSelect={handleGarmentSelect}
        />
      )}

      {/* Hide scrollbar for carousel */}
      <style dangerouslySetInnerHTML={{ __html: `
        .overflow-x-auto::-webkit-scrollbar { display: none; }
      ` }} />
    </div>
  );
}
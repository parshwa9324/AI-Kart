'use client';

import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

/* ── ANIMATED COUNTER ───────────────────────────────────────── */
function useCounter(target: number, duration = 3000, suffix = '') {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!isInView) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 5); // Exaggerated ease-out for luxury feel
      setCount(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, target, duration]);

  return { ref, count, suffix };
}

/* ── DATA ─────────────────────────────────────────────────── */
const METRICS = [
  { value: 1.4, suffix: 'MM', label: 'Tolerances Mapped' },
  { value: 99.9, suffix: '%', label: 'Physical Accuracy' },
  { value: 12, suffix: 'ns', label: 'Compute Latency' },
  { value: 47, suffix: '%', label: 'Return Reduction' },
];

/* ── CINEMATIC VARIANTS ────────────────────────────────────── */
const cinematicContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.3, delayChildren: 0.2 }
  },
};

const cinematicReveal = {
  hidden: { opacity: 0, y: 40, filter: 'blur(10px)' },
  visible: { 
    opacity: 1, 
    y: 0, 
    filter: 'blur(0px)',
    transition: { duration: 1.5, ease: [0.2, 0.8, 0.2, 1] } 
  },
};

/* ══════════════════════════════════════════════════════════════
   ULTRA-LUXURY LANDING PAGE
   ══════════════════════════════════════════════════════════════ */

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)] relative overflow-hidden selection:bg-white selection:text-black">
      
      {/* ── BACKGROUND MESH ─────────────────────────────────── */}
      <div className="absolute inset-0 bg-mesh opacity-40 mix-blend-screen pointer-events-none" />
      <div className="noise-overlay" />

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className="absolute top-0 w-full z-50 px-8 py-8 flex justify-between items-center mix-blend-difference">
        <div className="tracking-cinematic text-xs font-medium text-white">
          AI-KART / STRUCTURAL
        </div>
        <nav className="flex gap-12 text-[10px] tracking-cinematic text-[var(--text-secondary)]">
          <Link href="/try-on" className="hover:text-white transition-colors duration-500">CONSOLE</Link>
          <Link href="/admin" className="hover:text-white transition-colors duration-500">TENANT LOGIN</Link>
        </nav>
      </header>

      {/* ── HERO SECTION ────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center items-center px-4 md:px-12 text-center z-10">
        <motion.div
          className="max-w-7xl mx-auto flex flex-col items-center"
          variants={cinematicContainer}
          initial="hidden"
          animate="visible"
        >
          {/* Stark Headline */}
          <motion.h1
            variants={cinematicReveal}
            className="text-4xl md:text-7xl lg:text-8xl tracking-tight text-white mb-8"
            style={{ fontWeight: 300, letterSpacing: '-0.04em' }}
          >
            THE DETERMINISTIC
            <br />
            <span className="text-[var(--text-muted)] italic font-serif">PHYSICAL REALITY ENGINE.</span>
          </motion.h1>

          {/* Minimalist Subtitle */}
          <motion.p
            variants={cinematicReveal}
            className="text-[var(--text-secondary)] text-sm md:text-md max-w-2xl leading-relaxed mb-16 font-light"
          >
            We do not guess. We calculate the exact geometry of how a specific garment drapes 
            across a specific human body, accounting for stretch coefficients, 
            cut tolerances, and skeletal mechanics.
          </motion.p>

          {/* Action Architecture */}
          <motion.div
            variants={cinematicReveal}
            className="flex flex-col sm:flex-row items-center gap-6"
          >
            <Link
              href="/try-on"
              className="group relative px-10 py-4 bg-white text-black text-[10px] tracking-cinematic uppercase
                         transition-colors duration-500 hover:bg-[#E0E0E0] border border-transparent"
            >
              INITIALIZE CONSOLE
            </Link>

            <Link
              href="/admin"
              className="group relative px-10 py-4 bg-transparent text-[var(--text-secondary)] text-[10px] tracking-cinematic uppercase
                         border border-[var(--border-default)] transition-all duration-700
                         hover:text-white hover:border-white"
            >
              BRAND TENANT ACCESS
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2, duration: 2 }}
          className="absolute bottom-12 flex flex-col items-center gap-4 text-[10px] text-[var(--text-dim)] tracking-cinematic"
        >
          <span>SCROLL TO DESCEND</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-[var(--text-dim)] to-transparent" />
        </motion.div>
      </section>

      {/* ── METRICS SECTION ─────────────────────────────────── */}
      <section className="relative py-40 border-t border-[var(--border-subtle)] z-10 bg-[var(--surface-primary)]">
        <div className="max-w-7xl mx-auto px-8">
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8 divide-x divide-[var(--border-subtle)]"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={cinematicContainer}
          >
            {METRICS.map((metric, i) => (
              <MetricItem key={i} {...metric} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── PROPOSITION SECTION ─────────────────────────────── */}
      <section className="relative py-40 px-8 z-10">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={cinematicContainer}
        >
          <motion.h2 
            variants={cinematicReveal}
            className="text-3xl md:text-5xl text-white font-light mb-12"
            style={{ letterSpacing: '-0.03em' }}
          >
            INFRASTRUCTURE FOR THE <br/>UNCOMPROMISING.
          </motion.h2>
          <motion.div variants={cinematicReveal} className="grid md:grid-cols-2 gap-16 text-left">
            <div>
              <div className="text-[10px] tracking-cinematic text-white mb-4 border-b border-[var(--border-subtle)] pb-2">01 / PERCEPTION</div>
              <p className="text-[var(--text-secondary)] text-sm leading-loose">
                Photorealistic diffusion compositing directly onto live spatial feeds.
                The highest fidelity try-on ever achieved in a purely web-based environment.
              </p>
            </div>
            <div>
              <div className="text-[10px] tracking-cinematic text-white mb-4 border-b border-[var(--border-subtle)] pb-2">02 / PHYSICS</div>
              <p className="text-[var(--text-secondary)] text-sm leading-loose">
                Asymmetric tension models that penalize tight fits logarithmically. 
                We map materials from Elastane to Cashmere, predicting drape before production.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-default)] py-12 px-8 z-10 relative bg-[var(--background)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 pointer-events-none">
          <div className="text-[10px] tracking-cinematic text-[var(--foreground)]">
            AI-KART / MAISON LUXE
          </div>
          <div className="text-[10px] tracking-cinematic text-[var(--text-dim)]">
            © 2026 / PARIS / NEW YORK
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ── COMPONENTS ─────────────────────────────────────────────── */
function MetricItem({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, count } = useCounter(
    Number.isInteger(value) ? value : Math.round(value * 10),
    3000
  );

  const displayValue = Number.isInteger(value)
    ? count.toLocaleString()
    : (count / 10).toFixed(1);

  return (
    <motion.div ref={ref} variants={cinematicReveal} className="flex flex-col pl-8 first:pl-0 border-l-0 first:border-0">
      <div className="text-4xl md:text-5xl text-white font-light tracking-tight mb-4">
        {displayValue}<span className="text-[var(--text-muted)] text-3xl ml-1">{suffix}</span>
      </div>
      <div className="text-[10px] tracking-cinematic text-[var(--text-secondary)] uppercase">
        {label}
      </div>
    </motion.div>
  );
}

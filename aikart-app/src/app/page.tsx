'use client';

import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

/* ── ANIMATED COUNTER ─────────────────────────────────────────── */
function AnimatedCounter({ end, suffix = '', decimals = 0 }: { end: number; suffix?: string; decimals?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const dur = 2800;
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setVal(parseFloat((end * eased).toFixed(decimals)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, end, decimals]);

  return <span ref={ref}>{decimals > 0 ? val.toFixed(decimals) : Math.round(val)}{suffix}</span>;
}

/* ── LUXURY TICKER ────────────────────────────────────────────── */
const BRANDS = ['LVMH', 'HERMÈS', 'PRADA', 'GUCCI', 'BURBERRY', 'CARTIER', 'DIOR', 'CHANEL', 'VALENTINO', 'BALENCIAGA', 'VERSACE', 'FENDI'];

/* ── METRICS ──────────────────────────────────────────────────── */
const METRICS = [
  { value: 99.4, suffix: '%',  decimals: 1, label: 'FIT ACCURACY',     sub: 'Neural Mesh Analysis'    },
  { value: 47,   suffix: '%',  decimals: 0, label: 'RETURN REDUCTION',  sub: 'Post-Integration Avg.'   },
  { value: 1.4,  suffix: 'M',  decimals: 1, label: 'MEASUREMENTS',      sub: 'Spatial Data Points'     },
  { value: 12,   suffix: 's',  decimals: 0, label: 'INFERENCE TIME',    sub: 'RTX Local GPU Engine'    },
];

const FEATURE_PILLARS = [
  {
    symbol: '✦',
    title: 'Neural Fit Engine',
    body: 'MediaPipe kinematic skeleton + OOTDiffusion generates photorealistic try-on composites in 12 seconds on local GPU. Zero cloud latency.',
    tag: 'GPU / LOCAL',
  },
  {
    symbol: '◈',
    title: 'Spatial Body Mapping',
    body: 'Sub-millimeter skeletal geometry captured through your browser camera. 33-landmark pose graph rendered in real-time at 30fps.',
    tag: 'BIOMECHANICS',
  },
  {
    symbol: '▣',
    title: 'Enterprise Atelier API',
    body: 'White-label B2B platform. Brand-namespaced tenant isolation, custom garment CDN ingestion, SSO-ready authentication.',
    tag: 'B2B / SAAS',
  },
];

/* ═══════════════════════════════════════════════════════════════
   MAISON NOIR LANDING PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const yHero     = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);
  const opHero    = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}>

      {/* ── NAV ────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 48px',
          background: 'linear-gradient(to bottom, rgba(24,17,23,0.95), transparent)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--gold)', fontSize: 16, lineHeight: 1 }}>✦</span>
          <span className="tracking-luxury" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', color: 'var(--text-primary)' }}>AI-KART</span>
        </div>
        <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
          {['PLATFORM', 'ENTERPRISE', 'ATELIER'].map(n => (
            <span key={n} className="label-caps" style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
              {n}
            </span>
          ))}
          <Link href="/try-on">
            <button className="btn-gold" style={{ padding: '10px 24px', fontSize: 10 }}>ENTER ATELIER</button>
          </Link>
        </div>
      </motion.nav>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section ref={heroRef} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', paddingTop: 100 }}>

        {/* Background mesh lines */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04 }}>
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1={`${(i + 1) * 8}%`} y1="0" x2={`${(i + 1) * 8}%`} y2="100%" stroke="var(--gold)" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={`${(i + 1) * 12}%`} x2="100%" y2={`${(i + 1) * 12}%`} stroke="var(--gold)" strokeWidth="0.5" />
            ))}
          </svg>
        </div>

        {/* Gold radial glow behind headline */}
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '80vw', height: '60vh',
          background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <motion.div style={{ y: yHero, opacity: opHero, position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px' }}>

          {/* Pre-label */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 40 }}>
              <div style={{ height: 1, width: 60, background: 'linear-gradient(to right, transparent, var(--gold-dim))' }} />
              <span className="label-caps text-gold-shimmer">Virtual Atelier · B2B Enterprise Platform</span>
              <div style={{ height: 1, width: 60, background: 'linear-gradient(to left, transparent, var(--gold-dim))' }} />
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(52px, 10vw, 140px)',
              fontWeight: 300,
              letterSpacing: '-0.03em',
              lineHeight: 0.95,
              marginBottom: 16,
              color: 'var(--text-primary)',
            }}
          >
            The Future
          </motion.h1>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="text-gold"
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 'clamp(52px, 10vw, 140px)',
              fontWeight: 300,
              letterSpacing: '-0.03em',
              lineHeight: 0.95,
              marginBottom: 48,
            }}
          >
            of Fashion
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 1.0 }}
            style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 56px', letterSpacing: '0.02em', lineHeight: 1.7 }}
          >
            AI-powered virtual try-on for luxury fashion brands.<br />
            Local GPU inference · Neural fit scoring · Sub-second rendering.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}
          >
            <Link href="/try-on">
              <button className="btn-gold animate-gold-pulse" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                ENTER ATELIER
                <ArrowRight size={14} />
              </button>
            </Link>
            <Link href="/login">
              <button className="btn-ghost" style={{ fontSize: 11 }}>REQUEST ACCESS</button>
            </Link>
          </motion.div>

          {/* Floating metrics cards */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 1.0, staggerChildren: 0.1 }}
            style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 72, flexWrap: 'wrap' }}
          >
            {METRICS.map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 + i * 0.12, duration: 0.7 }}
                className="glass-card-gold animate-float"
                style={{
                  padding: '20px 28px',
                  minWidth: 150,
                  textAlign: 'center',
                  animationDelay: `${i * 0.8}s`,
                }}
              >
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em' }} className="text-gold">
                  <AnimatedCounter end={m.value} suffix={m.suffix} decimals={m.decimals} />
                </div>
                <div className="label-caps" style={{ marginTop: 6, color: 'var(--text-primary)', opacity: 0.9 }}>{m.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.06em' }}>{m.sub}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── BRAND TICKER ───────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        padding: '18px 0',
        background: 'var(--surface-low)',
      }}>
        <div style={{ display: 'flex', width: 'max-content' }} className="animate-ticker">
          {[...BRANDS, ...BRANDS].map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 32, paddingRight: 32 }}>
              <span className="label-caps" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b}</span>
              <span style={{ color: 'var(--gold-dim)', opacity: 0.4, fontSize: 10 }}>·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── FEATURE PILLARS ────────────────────────────────────── */}
      <section style={{ padding: '160px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: [0.2, 0.8, 0.2, 1] }}
          viewport={{ once: true, margin: '-80px' }}
          style={{ marginBottom: 100 }}
        >
          <div className="label-caps" style={{ marginBottom: 16 }}>Platform Architecture</div>
          <div style={{ height: 1, width: 80, background: 'linear-gradient(to right, var(--gold-dim), transparent)', marginBottom: 40 }} />
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(36px,6vw,72px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.05, maxWidth: 700 }}>
            Three pillars.<br />
            <em className="text-gold" style={{ fontStyle: 'italic' }}>One seamless experience.</em>
          </h2>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2 }}>
          {FEATURE_PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              viewport={{ once: true }}
              style={{
                background: 'var(--surface-low)',
                padding: '48px 40px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'background 0.4s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-container)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-low)')}
            >
              {/* Gold accent line on hover */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'var(--gold-gradient)', opacity: 0, transition: 'opacity 0.4s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
              />

              <div style={{ marginBottom: 32 }}>
                <span className="label-caps" style={{ color: 'var(--gold-dim)', fontSize: 9 }}>{p.tag}</span>
              </div>
              <div style={{ fontSize: 28, marginBottom: 24, color: 'var(--gold)', lineHeight: 1 }}>{p.symbol}</div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 400, marginBottom: 16, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, letterSpacing: '0.01em' }}>{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA SECTION ────────────────────────────────────────── */}
      <section style={{ textAlign: 'center', padding: '120px 48px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.0, ease: [0.2, 0.8, 0.2, 1] }}
          viewport={{ once: true }}
        >
          <div className="label-caps" style={{ marginBottom: 32, color: 'var(--gold-dim)' }}>Invitation Only · Enterprise Access</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px, 7vw, 88px)', fontWeight: 300, letterSpacing: '-0.03em', marginBottom: 48, lineHeight: 1.0 }}>
            Ready to enter<br />
            <em className="text-gold" style={{ fontStyle: 'italic' }}>the atelier?</em>
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <Link href="/try-on">
              <button className="btn-gold" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
                OPEN VIRTUAL ATELIER <ArrowRight size={14} />
              </button>
            </Link>
            <Link href="/login">
              <button className="btn-ghost" style={{ fontSize: 11 }}>BRAND PARTNERSHIP ACCESS</button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '40px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--gold)', fontSize: 14 }}>✦</span>
          <span className="label-caps" style={{ fontSize: 10 }}>AI-KART · MAISON NOIR</span>
        </div>
        <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-dim)' }}>RTX Local Neural Engine · Enterprise Virtual Atelier Platform</span>
      </footer>

    </main>
  );
}

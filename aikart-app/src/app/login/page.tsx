'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = '/try-on';
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', background: 'var(--background)', fontFamily: 'var(--font-sans)' }}>

      {/* ── LEFT: EDITORIAL PANEL ─────────────────────────────── */}
      <div style={{
        flex: '0 0 55%', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        background: 'var(--surface-low)',
      }}>
        {/* Gold mesh grid */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04 }}>
          <svg width="100%" height="100%">
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`v${i}`} x1={`${i * 5.26}%`} y1="0" x2={`${i * 5.26}%`} y2="100%" stroke="var(--gold)" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={`${i * 5.26}%`} x2="100%" y2={`${i * 5.26}%`} stroke="var(--gold)" strokeWidth="0.5" />
            ))}
          </svg>
        </div>

        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: '20%', left: '20%',
          width: '60%', height: '60%',
          background: 'radial-gradient(ellipse, rgba(201,168,76,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: '40%', height: '40%',
          background: 'radial-gradient(ellipse at bottom right, rgba(185,196,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Nav in corner */}
        <div style={{ position: 'absolute', top: 40, left: 48, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--gold)', fontSize: 16 }}>✦</span>
          <span className="label-caps" style={{ fontSize: 10, letterSpacing: '0.22em' }}>AI-KART</span>
        </div>

        {/* Central editorial content */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative', zIndex: 10, padding: '0 48px 80px' }}
        >
          <div className="label-caps" style={{ marginBottom: 20, color: 'var(--gold-dim)' }}>MAISON NOIR · VIRTUAL ATELIER</div>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(48px, 7vw, 88px)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            lineHeight: 1.0,
            marginBottom: 32,
          }}>
            Couture.<br />
            <em className="text-gold" style={{ fontStyle: 'italic' }}>Reimagined.</em>
          </h1>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.7, marginBottom: 48 }}>
            The world's first luxury virtual try-on platform powered by local neural inference. Designed for Maisons that demand perfection.
          </p>

          {/* Stats ribbon */}
          <div style={{ display: 'flex', gap: 40 }}>
            {[
              { val: '99.4%', label: 'Fit Accuracy' },
              { val: 'RTX',   label: 'Local GPU' },
              { val: 'B2B',   label: 'Enterprise' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 300, letterSpacing: '-0.02em' }} className="text-gold">{s.val}</div>
                <div className="label-caps" style={{ fontSize: 9, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT: LOGIN FORM ─────────────────────────────────── */}
      <div style={{
        flex: '0 0 45%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        padding: '80px 64px',
        background: 'var(--background)',
        position: 'relative',
      }}>

        {/* Subtle vertical accent line */}
        <div style={{
          position: 'absolute', left: 0, top: '15%', bottom: '15%',
          width: 1,
          background: 'linear-gradient(to bottom, transparent, var(--gold-dim), transparent)',
          opacity: 0.2,
        }} />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: 380 }}
        >
          {/* Header */}
          <div style={{ marginBottom: 56 }}>
            <div className="label-caps" style={{ color: 'var(--gold-dim)', marginBottom: 16, fontSize: 9 }}>PROTECTED ACCESS</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', marginBottom: 8 }}>Atelier Entry</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>Present your credentials to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

            {/* Email */}
            <div style={{ position: 'relative' }}>
              <div className="label-caps" style={{
                fontSize: 9, marginBottom: 10,
                color: focused === 'email' ? 'var(--gold)' : 'var(--text-muted)',
                transition: 'color 0.3s',
              }}>BRAND EMAIL</div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                className="input-maison"
                style={{ borderBottomColor: focused === 'email' ? 'var(--gold)' : undefined }}
                placeholder="brand@maison.com"
                required
              />
            </div>

            {/* Password */}
            <div style={{ position: 'relative' }}>
              <div className="label-caps" style={{
                fontSize: 9, marginBottom: 10,
                color: focused === 'password' ? 'var(--gold)' : 'var(--text-muted)',
                transition: 'color 0.3s',
              }}>ACCESS KEY</div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  className="input-maison"
                  style={{ paddingRight: 32, borderBottomColor: focused === 'password' ? 'var(--gold)' : undefined }}
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-gold"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 11, padding: '16px', marginTop: 8 }}
            >
              ENTER ATELIER
              <ArrowRight size={14} />
            </button>
          </form>

          {/* Footer links */}
          <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--gold)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
              >
                ← BACK TO MAISON
              </span>
            </Link>
            <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>REQUEST BRAND ACCESS</span>
          </div>

          {/* Decorative bottom element */}
          <div style={{ marginTop: 64 }}>
            <div className="divider-gold" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SSL ENCRYPTED</span>
              <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-dim)' }}>ENTERPRISE GRADE</span>
              <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SOC 2 READY</span>
            </div>
          </div>
        </motion.div>
      </div>

    </main>
  );
}

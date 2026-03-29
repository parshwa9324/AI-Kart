'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { GARMENT_CATALOG } from '../../data/GarmentCatalog';
import { usePoseStore } from '../../store/PoseStore';
import { motion, AnimatePresence, animate, useReducedMotion } from 'framer-motion';
import { Camera, Upload, Sparkles, CheckCircle2, RotateCcw, Search, SlidersHorizontal, Grid2X2, List, Download, Share2, X } from 'lucide-react';
import BodyCalibrationModal from '../../components/ui/BodyCalibrationModal';
import FitPanel from '../../components/ui/FitPanel';
import { AIKartAPI } from '@/ar-engine/APIClient';
import type { ProgressCallback } from '@/ar-engine/APIClient';
import { usePhysicalTwinContext } from '@/components/PhysicalTwinProvider';

/* ══════════════════════════════════════════════════════════════
   MAISON NOIR — VIRTUAL ATELIER WORKSPACE
   Bloomberg Terminal × Hermès Atelier
   ══════════════════════════════════════════════════════════════ */

// Category filter definitions
const CATEGORIES = [
  { key: 'all',        label: 'All',       count: GARMENT_CATALOG.length },
  { key: 'jacket',     label: 'Jackets',   count: GARMENT_CATALOG.filter(g => g.category === 'jacket').length },
  { key: 'tshirt',     label: 'T-Shirts',  count: GARMENT_CATALOG.filter(g => g.category === 'tshirt').length },
  { key: 'longsleeve', label: 'Long Sleeve', count: GARMENT_CATALOG.filter(g => g.category === 'longsleeve').length },
  { key: 'dress',      label: 'Dresses',   count: GARMENT_CATALOG.filter(g => g.category === 'dress').length },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];
type CatalogViewItem = {
  name: string;
  category: string;
  displayUrl: string;
  originalIdx: number;
  isCustom: boolean;
};

// View mode: grid or list
type ViewMode = 'grid' | 'list';

function makePlaceholderPhotoB64(): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const g = ctx.createLinearGradient(0, 0, 256, 384);
  g.addColorStop(0, '#c4a882');
  g.addColorStop(1, '#6e5a48');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 384);
  return c.toDataURL('image/jpeg', 0.92).split(',')[1] ?? '';
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to preload image'));
    img.src = url;
  });
}

export default function TryOnPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compareFrameRef = useRef<HTMLDivElement>(null);

  const [activeGarment, setActiveGarment]         = useState(GARMENT_CATALOG[0].displayUrl);
  const [showCalibration, setShowCalibration]     = useState(false);
  const [activeCatalogIdx, setActiveCatalogIdx]   = useState(0);
  const [isGenerating, setIsGenerating]           = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedThumbUrl, setGeneratedThumbUrl] = useState<string | null>(null);
  const [uploadedGarments, setUploadedGarments]   = useState<{ name: string; url: string; category: string }[]>([]);
  /** Raw base64 (no data: prefix) for API */
  const [userPhotoB64, setUserPhotoB64] = useState<string | null>(null);
  /** Data URL for before/after “before” side */
  const [beforePhotoDisplayUrl, setBeforePhotoDisplayUrl] = useState<string | null>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);

  const [showLuxuryResult, setShowLuxuryResult] = useState(false);
  const [compareSlider, setCompareSlider] = useState(50);
  const [fitScoreDisplay, setFitScoreDisplay] = useState(0);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // ── Collection sidebar state ────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [viewMode, setViewMode]             = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery]       = useState('');
  const [searchFocused, setSearchFocused]   = useState(false);

  // ── Generation progress ─────────────────────────────────────
  const [progressPct, setProgressPct]         = useState(0);
  const [progressDetail, setProgressDetail]   = useState('');
  const [elapsedSeconds, setElapsedSeconds]   = useState(0);
  const [generationPhase, setGenerationPhase] = useState<'queued' | 'processing' | 'uploading'>('queued');
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── GPU Busy State ──────────────────────────────────────────
  const [gpuBusy, setGpuBusy] = useState(false);
  const { renderHistory, addRenderToHistory } = usePhysicalTwinContext();
  const prefersReducedMotion = useReducedMotion();

  const bodyProfile = usePoseStore(s => s.bodyProfile);

  const stepMatch = progressDetail.match(/Step\s+(\d+)\/(\d+)/i);
  const currentStep = stepMatch ? Number(stepMatch[1]) : Math.max(0, Math.round((progressPct / 100) * 30));
  const totalSteps = stepMatch ? Number(stepMatch[2]) : 30;
  const pctEta = progressPct > 0 ? Math.max(0, Math.round((elapsedSeconds * (100 - progressPct)) / progressPct)) : null;
  const stepEta = currentStep > 0 && totalSteps > currentStep
    ? Math.max(0, Math.round((elapsedSeconds / currentStep) * (totalSteps - currentStep)))
    : null;
  const estimatedRemaining = stepEta ?? pctEta;
  const stageLabel = useMemo(() => {
    const d = progressDetail.toLowerCase();
    if (d.includes('loading') || d.includes('initializing')) return 'MODEL PREP';
    if (d.includes('diffusing') || d.includes('step')) return 'DIFFUSION';
    if (d.includes('shadow')) return 'LIGHT PASS';
    if (d.includes('texture') || d.includes('refining')) return 'DETAIL PASS';
    if (d.includes('saving') || d.includes('upload')) return 'FINALIZING';
    return generationPhase === 'uploading' ? 'FINALIZING' : 'NEURAL COMPOSITOR';
  }, [generationPhase, progressDetail]);

  const revealDuration = prefersReducedMotion ? 0.2 : 0.8;
  const scoreAnimDuration = prefersReducedMotion ? 0.35 : 1.15;

  useEffect(() => {
    if (!actionToast) return;
    const t = setTimeout(() => setActionToast(null), 1800);
    return () => clearTimeout(t);
  }, [actionToast]);

  // ── Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (isGenerating) {
      const start = Date.now();
      elapsedRef.current = setInterval(() => setElapsedSeconds(+(((Date.now() - start) / 1000).toFixed(1))), 100);
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [isGenerating]);

  // ── Filtered catalog ────────────────────────────────────────
  const filteredCatalog = useMemo(() => {
    const all: CatalogViewItem[] = [
      ...GARMENT_CATALOG.map((g, i) => ({
        name: g.name,
        category: String(g.category),
        displayUrl: g.displayUrl,
        originalIdx: i,
        isCustom: false,
      })),
      ...uploadedGarments.map((g, i) => ({
        name: g.name,
        category: g.category,
        displayUrl: g.url,
        originalIdx: GARMENT_CATALOG.length + i,
        isCustom: true,
      })),
    ];
    return all.filter(g => {
      const matchCat = activeCategory === 'all' || g.category === activeCategory;
      const matchSearch = !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery, uploadedGarments]);
  const activeEntry = GARMENT_CATALOG[activeCatalogIdx];

  // ── Generate try-on ─────────────────────────────────────────
  const handlePortraitFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const d = reader.result as string;
      setBeforePhotoDisplayUrl(d);
      const parts = d.split(',');
      setUserPhotoB64(parts[1] ?? null);
    };
    reader.readAsDataURL(file);
    if (portraitInputRef.current) portraitInputRef.current.value = '';
  }, []);

  const handleGenerateFit = async () => {
    if (!bodyProfile) { setShowCalibration(true); return; }
    setIsGenerating(true);
    setGeneratedImageUrl(null);
    setGeneratedThumbUrl(null);
    setShowLuxuryResult(false);
    setProgressPct(0); setProgressDetail(''); setElapsedSeconds(0); setGenerationPhase('queued');
    const photoB64 = userPhotoB64 ?? makePlaceholderPhotoB64();
    if (!beforePhotoDisplayUrl && photoB64) {
      setBeforePhotoDisplayUrl(`data:image/jpeg;base64,${photoB64}`);
    }
    try {
      const onProgress: ProgressCallback = (update) => {
        setProgressPct(update.progressPct);
        if (update.detail) setProgressDetail(update.detail);
        if (update.status === 'queued') setGenerationPhase('queued');
        else if (update.status === 'processing' || update.status === 'retrying') setGenerationPhase('processing');
        else if (update.progressPct >= 95) setGenerationPhase('uploading');
      };
      setGenerationPhase('processing');
      const response = await AIKartAPI.renderTryOn({
        userPhoto: photoB64,
        garmentId: GARMENT_CATALOG[activeCatalogIdx]?.defaultSpec?.id ?? 'default',
        includeRecommendation: true,
      }, onProgress);
      setGenerationPhase('uploading');
      setProgressPct(100);
      if (response.imageUrl) {
        const score = response.recommendation?.confidenceScore ?? 94;
        const resolvedScore = typeof score === 'number' ? score : 94;
        setGeneratedImageUrl(response.imageUrl);
        setGeneratedThumbUrl(response.thumbUrl ?? null);
        setCompareSlider(50);
        await preloadImage(response.imageUrl).catch(() => undefined);
        await new Promise(r => setTimeout(r, prefersReducedMotion ? 60 : 160));
        setShowLuxuryResult(true);
        setFitScoreDisplay(0);
        animate(0, resolvedScore, {
          duration: scoreAnimDuration,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => setFitScoreDisplay(Math.round(v * 10) / 10),
        });
        addRenderToHistory({
          imageUrl: response.imageUrl,
          thumbUrl: response.thumbUrl ?? null,
          beforeImageUrl: beforePhotoDisplayUrl ?? (photoB64 ? `data:image/jpeg;base64,${photoB64}` : null),
          fitScore: resolvedScore,
          garmentName: activeEntry?.name ?? 'Custom Garment',
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error: unknown) {
      // Detect GPU busy (503) — show the luxury overlay instead of generic error
      const err = error as { status?: number; message?: string };
      if (err?.status === 503 || err?.message?.includes('GPU') || err?.message?.includes('occupied')) {
        setGpuBusy(true);
        setTimeout(() => setGpuBusy(false), 8000);
      } else {
        console.error("Try-On ML Render Failed:", error);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const setSliderFromClientX = useCallback((clientX: number) => {
    const frame = compareFrameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setCompareSlider(Math.max(0, Math.min(100, pct)));
  }, []);

  const adjustCompareSlider = useCallback((delta: number) => {
    setCompareSlider((v) => Math.max(0, Math.min(100, v + delta)));
  }, []);

  const onComparePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setSliderFromClientX(e.clientX);
    const move = (ev: PointerEvent) => setSliderFromClientX(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [setSliderFromClientX]);

  const selectGarment = useCallback((idx: number, url: string) => {
    setActiveCatalogIdx(idx); setActiveGarment(url); setGeneratedImageUrl(null); setGeneratedThumbUrl(null);
    setShowLuxuryResult(false);
  }, []);

  const closeLuxuryResult = useCallback(() => {
    setShowLuxuryResult(false);
  }, []);

  const tryAnotherGarment = useCallback(() => {
    setShowLuxuryResult(false);
    setGeneratedImageUrl(null);
    setGeneratedThumbUrl(null);
  }, []);

  const restoreHistoryRender = useCallback((item: { imageUrl: string; thumbUrl: string | null; beforeImageUrl: string | null; fitScore: number }) => {
    (async () => {
      await preloadImage(item.imageUrl).catch(() => undefined);
      setGeneratedImageUrl(item.imageUrl);
      setGeneratedThumbUrl(item.thumbUrl);
      setBeforePhotoDisplayUrl(item.beforeImageUrl);
      setFitScoreDisplay(0);
      setCompareSlider(50);
      setShowLuxuryResult(true);
      animate(0, item.fitScore, {
        duration: prefersReducedMotion ? 0.25 : 0.9,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (v) => setFitScoreDisplay(Math.round(v * 10) / 10),
      });
    })();
  }, [prefersReducedMotion]);

  const downloadFullRender = useCallback(() => {
    if (!generatedImageUrl) return;
    const garmentName = (activeEntry?.name ?? 'atelier-render')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    a.href = generatedImageUrl;
    a.download = `aikart-${garmentName}-${stamp}.jpg`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setActionToast('Render downloaded');
  }, [activeEntry?.name, generatedImageUrl]);

  const shareRender = useCallback(async () => {
    const url = generatedImageUrl;
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'AI-Kart Atelier', text: 'Virtual try-on render', url });
        setActionToast('Share sheet opened');
      } else {
        if (!window.isSecureContext || !navigator.clipboard) {
          setActionToast('Secure context required to copy');
          return;
        }
        await navigator.clipboard.writeText(url);
        setActionToast('Render URL copied');
      }
    } catch {
      setActionToast('Share unavailable');
    }
  }, [generatedImageUrl]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    setUploadedGarments(prev => [...prev, { name, url, category: 'custom' }]);
    selectGarment(GARMENT_CATALOG.length + uploadedGarments.length, url);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadedGarments.length, selectGarment]);

  useEffect(() => {
    return () => {
      uploadedGarments.forEach((g) => {
        if (g.url.startsWith('blob:')) URL.revokeObjectURL(g.url);
      });
    };
  }, [uploadedGarments]);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BodyCalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} />

      {/* ── GPU BUSY OVERLAY ──────────────────────────────── */}
      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'fixed',
              top: 72,
              right: 24,
              zIndex: 520,
              padding: '10px 14px',
              border: '1px solid rgba(201,168,76,0.4)',
              background: 'rgba(15, 11, 17, 0.92)',
              color: 'var(--gold-dim)',
              letterSpacing: '0.12em',
              fontSize: 9,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {actionToast}
          </motion.div>
        )}
        {gpuBusy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(24, 17, 23, 0.85)',
              backdropFilter: 'blur(20px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 20,
            }}
            onClick={() => setGpuBusy(false)}
          >
            {/* Pulsing GPU status dot */}
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: '#E6C364',
              boxShadow: '0 0 20px rgba(230, 195, 100, 0.5), 0 0 60px rgba(230, 195, 100, 0.2)',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
              <p style={{
                color: '#E6C364', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px',
              }}>Neural Atelier Occupied</p>
              <p style={{ color: '#B8A99A', fontSize: 14, lineHeight: 1.6, maxWidth: 380 }}>
                Another rendering is currently using the GPU pipeline.
                <br />Please wait a moment and try again.
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setGpuBusy(false); handleGenerateFit(); }}
              style={{
                marginTop: 12, padding: '10px 28px',
                background: 'transparent', border: '1px solid rgba(230, 195, 100, 0.3)',
                color: '#E6C364', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                (e.target as HTMLButtonElement).style.borderColor = '#E6C364';
                (e.target as HTMLButtonElement).style.background = 'rgba(230, 195, 100, 0.08)';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLButtonElement).style.borderColor = 'rgba(230, 195, 100, 0.3)';
                (e.target as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Retry Render
            </button>
            <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.6; } }`}</style>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LUXURY RESULT — editorial reveal (Maison Noir gold) ── */}
      <AnimatePresence>
        {showLuxuryResult && generatedImageUrl && (
          <motion.div
            key="luxury-result"
            role="dialog"
            aria-modal
            aria-label="Render complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: revealDuration }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 400,
              background: 'radial-gradient(ellipse 120% 80% at 50% 0%, rgba(45, 32, 40, 0.97), rgba(10, 8, 12, 0.98))',
              backdropFilter: 'blur(24px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'clamp(16px, 4vw, 48px)',
              overflow: 'auto',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: revealDuration, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: 'min(960px, 100%)',
                maxHeight: 'min(92vh, 900px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <p className="label-caps" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--gold-dim)', marginBottom: 6 }}>Atelier render</p>
                  <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 22, fontWeight: 400, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.02em' }}>
                    Your look, refined.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeLuxuryResult}
                  aria-label="Close"
                  style={{
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: '1px solid rgba(201,168,76,0.25)',
                    background: 'rgba(0,0,0,0.35)',
                    color: 'var(--gold)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 520,
                  margin: '0 auto',
                  aspectRatio: '3/4',
                  borderRadius: 4,
                  overflow: 'hidden',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(201,168,76,0.12)',
                }}
                ref={compareFrameRef}
                onPointerDown={onComparePointerDown}
                onDoubleClick={() => setCompareSlider(50)}
                role="slider"
                aria-label="Before and after comparison"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(compareSlider)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') { e.preventDefault(); adjustCompareSlider(-2); }
                  if (e.key === 'ArrowRight') { e.preventDefault(); adjustCompareSlider(2); }
                  if (e.key === 'Home') { e.preventDefault(); setCompareSlider(0); }
                  if (e.key === 'End') { e.preventDefault(); setCompareSlider(100); }
                }}
              >
                {/* After (full render) */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={generatedImageUrl}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {/* Before (portrait) clipped */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${compareSlider}%`,
                    overflow: 'hidden',
                    borderRight: '2px solid rgba(201,168,76,0.85)',
                    boxShadow: '4px 0 24px rgba(0,0,0,0.35)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beforePhotoDisplayUrl ?? `data:image/jpeg;base64,${makePlaceholderPhotoB64()}`}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      minWidth: '100%',
                      minHeight: '100%',
                    }}
                  />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${compareSlider}%`,
                    width: 2,
                    background: 'linear-gradient(180deg, rgba(240,220,166,0.95), rgba(201,168,76,0.95))',
                    boxShadow: '0 0 14px rgba(201,168,76,0.55)',
                    transform: 'translateX(-1px)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${compareSlider}%`,
                    top: '50%',
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: '1px solid rgba(201,168,76,0.85)',
                    background: 'rgba(10,8,12,0.76)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--gold)',
                    pointerEvents: 'none',
                  }}
                >
                  <SlidersHorizontal size={12} />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 44,
                    left: 12,
                    right: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span className="label-caps" style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', width: 56 }}>Portrait</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={compareSlider}
                    onChange={(e) => setCompareSlider(Number(e.target.value))}
                    aria-label="Compare before and after"
                    style={{ flex: 1, accentColor: '#c9a84c' }}
                  />
                  <span className="label-caps" style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', width: 56, textAlign: 'right' }}>Atelier</span>
                </div>
                <div
                  className="label-caps"
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    fontSize: 8,
                    padding: '7px 10px',
                    border: '1px solid rgba(201,168,76,0.4)',
                    color: 'var(--gold-dim)',
                    background: 'rgba(0,0,0,0.45)',
                    letterSpacing: '0.14em',
                  }}
                >
                  Rendered on RTX 4050 - 30 steps
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center', gap: 20 }}>
                <div
                  style={{
                    minWidth: 200,
                    padding: '20px 24px',
                    background: 'linear-gradient(145deg, rgba(201,168,76,0.08), rgba(24,17,23,0.9))',
                    border: '1px solid rgba(201,168,76,0.35)',
                    borderRadius: 4,
                    boxShadow: '0 0 40px rgba(201,168,76,0.06)',
                  }}
                >
                  <p className="label-caps" style={{ fontSize: 8, letterSpacing: '0.18em', color: 'var(--gold-dim)', marginBottom: 8 }}>Fit intelligence</p>
                  <p
                    className="luxury-fit-score"
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace)',
                      fontSize: 42,
                      fontWeight: 300,
                      margin: 0,
                      lineHeight: 1,
                      background: 'linear-gradient(110deg, #f0e6d2 0%, #c9a84c 40%, #e8dcc4 55%, #c9a84c 75%, #f5f0e6 100%)',
                      backgroundSize: '220% 100%',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      animation: 'goldShimmer 3.5s ease-in-out infinite',
                    }}
                  >
                    {fitScoreDisplay.toFixed(1)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0' }}>Confidence score — editorial fit</p>
                  <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                      <span>CHEST</span><span style={{ color: 'var(--gold-dim)' }}>Perfect +0.8cm</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                      <span>WAIST</span><span style={{ color: '#d2b176' }}>Snug -1.2cm → Size Up</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', minWidth: 220 }}>
                  <button type="button" onClick={downloadFullRender} className="btn-gold" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 10, padding: '12px 20px' }}>
                    <Download size={14} /> Download render
                  </button>
                  <button
                    type="button"
                    onClick={shareRender}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: 10,
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <Share2 size={14} /> Share
                  </button>
                  <button type="button" onClick={tryAnotherGarment} style={{ fontSize: 10, padding: '10px', background: 'none', border: 'none', color: 'var(--gold-dim)', cursor: 'pointer', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    Try another garment
                  </button>
                </div>
              </div>

              {generatedThumbUrl && (
                <p className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', opacity: 0.7 }}>
                  Preview optimized for UI — full resolution available via download
                </p>
              )}

              <style>{`
                @keyframes goldShimmer {
                  0%, 100% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                }
              `}</style>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOP NAVIGATION BAR ──────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56,
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(24,17,23,0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--gold)', fontSize: 12 }}>✦</span>
            <span className="label-caps" style={{ fontSize: 10, letterSpacing: '0.2em' }}>AI-KART / ATELIER</span>
          </div>
          <div style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
          <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Virtual Try-On Engine</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input ref={portraitInputRef} type="file" accept="image/*" capture="environment" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={handlePortraitFile} />
          <button
            type="button"
            onClick={() => portraitInputRef.current?.click()}
            className="btn-ghost"
            style={{ fontSize: 9, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={11} />
            PORTRAIT
          </button>
          {bodyProfile ? (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(201,168,76,0.06)', border: '1px solid var(--border-gold)' }}
            >
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)' }} />
              <span className="label-caps" style={{ fontSize: 9, color: 'var(--gold-dim)' }}>PROFILE — {bodyProfile.heightCm}CM CALIBRATED</span>
            </motion.div>
          ) : (
            <button onClick={() => setShowCalibration(true)} className="btn-ghost"
              style={{ fontSize: 9, padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <Camera size={11} />
              CREATE DIGITAL PROFILE
            </button>
          )}
        </div>
      </header>

      {/* ── THREE-PANEL WORKSPACE ────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr 300px', overflow: 'hidden', height: 'calc(100vh - 56px)' }}>

        {/* ══════════════════════════════════════════════════════
            LEFT: LUXURY COLLECTION INDEX
            ══════════════════════════════════════════════════════ */}
        <aside style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--surface-low)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Panel Header ─── */}
          <div style={{ padding: '16px 16px 0', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span className="label-caps" style={{ fontSize: 9, color: 'var(--gold-dim)' }}>COLLECTION INDEX</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* View toggle */}
                {(['grid', 'list'] as ViewMode[]).map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: viewMode === mode ? 'rgba(201,168,76,0.1)' : 'transparent',
                      border: viewMode === mode ? '1px solid var(--border-gold)' : '1px solid transparent',
                      color: viewMode === mode ? 'var(--gold)' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {mode === 'grid' ? <Grid2X2 size={11} /> : <List size={11} />}
                  </button>
                ))}
                {/* Upload */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                <button onClick={() => fileInputRef.current?.click()}
                  title="Upload custom garment"
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: '1px solid transparent',
                    color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <Upload size={11} />
                </button>
              </div>
            </div>

            {/* ── Search ─── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 12,
              background: 'var(--surface-container)',
              border: `1px solid ${searchFocused ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
              transition: 'border-color 0.2s',
            }}>
              <Search size={11} style={{ color: searchFocused ? 'var(--gold)' : 'var(--text-muted)', flexShrink: 0, transition: 'color 0.2s' }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search collection..."
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.03em',
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>

            {/* ── Category Filter Tabs ─── */}
            <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 0, scrollbarWidth: 'none' }}>
              {CATEGORIES.filter(c => c.count > 0 || c.key === 'all').map(cat => (
                <button key={cat.key} onClick={() => setActiveCategory(cat.key as CategoryKey)}
                  style={{
                    flexShrink: 0, padding: '9px 10px',
                    borderBottom: activeCategory === cat.key ? '2px solid var(--gold)' : '2px solid transparent',
                    background: 'transparent', cursor: 'pointer',
                    color: activeCategory === cat.key ? 'var(--gold)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)', fontWeight: 500, letterSpacing: '0.1em',
                    fontSize: 9, textTransform: 'uppercase', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {cat.label}
                  {cat.count > 0 && (
                    <span style={{
                      fontSize: 8, padding: '1px 4px',
                      background: activeCategory === cat.key ? 'rgba(201,168,76,0.2)' : 'var(--surface-container)',
                      color: activeCategory === cat.key ? 'var(--gold)' : 'var(--text-dim)',
                      borderRadius: 2,
                    }}>
                      {cat.key === 'all' ? GARMENT_CATALOG.length + uploadedGarments.length : cat.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Garment Cards ─── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? '12px' : '0', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-subtle) transparent' }}>
            <AnimatePresence mode="popLayout">
              {filteredCatalog.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8 }}
                >
                  <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)' }}>No items match</span>
                </motion.div>
              ) : viewMode === 'grid' ? (
                /* ── GRID VIEW ─── */
                <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
                >
                  {filteredCatalog.map((entry, i) => {
                    const isActive = activeCatalogIdx === entry.originalIdx;
                    return (
                      <motion.button key={`${entry.name}-${i}`}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                        onClick={() => selectGarment(entry.originalIdx, entry.displayUrl)}
                        whileHover={{ y: -2 }}
                        style={{
                          display: 'flex', flexDirection: 'column',
                          background: isActive ? 'rgba(201,168,76,0.07)' : 'var(--surface-container)',
                          border: isActive ? '1px solid var(--border-gold)' : '1px solid var(--border-subtle)',
                          cursor: 'pointer', overflow: 'hidden', textAlign: 'left',
                          transition: 'border-color 0.2s, background 0.2s', position: 'relative',
                        }}
                      >
                        {/* Category badge */}
                        <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, padding: '2px 6px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                          <span className="label-caps" style={{ fontSize: 7, color: isActive ? 'var(--gold)' : 'var(--text-muted)' }}>
                            {entry.category?.toUpperCase()}
                          </span>
                        </div>
                        {/* Active dot */}
                        {isActive && (
                          <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)' }} />
                        )}
                        {/* Garment image — portrait format */}
                        <div style={{ width: '100%', aspectRatio: '2/3', overflow: 'hidden', background: 'var(--surface-highest)', position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={entry.displayUrl}
                            alt={entry.name}
                            style={{
                              width: '100%', height: '100%', objectFit: 'cover',
                              filter: isActive ? 'none' : 'grayscale(20%) brightness(0.9)',
                              transition: 'filter 0.35s',
                            }}
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                              const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (sibling?.style) sibling.style.display = 'flex';
                            }}
                          />
                          {/* Fallback silhouette */}
                          <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 28, opacity: 0.2 }}>👕</div>
                            <span className="label-caps" style={{ fontSize: 7, color: 'var(--text-muted)' }}>3D MODEL</span>
                          </div>
                          {/* Gold shimmer overlay on active */}
                          {isActive && (
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(201,168,76,0.08), transparent)', pointerEvents: 'none' }} />
                          )}
                        </div>
                        {/* Name row */}
                        <div style={{ padding: '8px 10px 10px' }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', letterSpacing: '0.02em', lineHeight: 1.3, marginBottom: 3 }}>
                            {entry.name}
                          </div>
                          {entry.isCustom && (
                            <span className="label-caps" style={{ fontSize: 7, color: 'var(--text-muted)' }}>CUSTOM UPLOAD</span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              ) : (
                /* ── LIST VIEW ─── */
                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ display: 'flex', flexDirection: 'column' }}
                >
                  {filteredCatalog.map((entry, i) => {
                    const isActive = activeCatalogIdx === entry.originalIdx;
                    return (
                      <motion.button key={`${entry.name}-${i}`}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => selectGarment(entry.originalIdx, entry.displayUrl)}
                        whileHover={{ x: 2 }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          background: isActive ? 'var(--surface-container)' : 'transparent',
                          borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                          borderBottom: '1px solid var(--border-subtle)',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.2s',
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{ width: 52, height: 68, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-highest)', position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={entry.displayUrl}
                            alt={entry.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isActive ? 'none' : 'grayscale(60%)',  transition: 'filter 0.3s' }}
                            onError={e => { e.currentTarget.style.opacity = '0'; }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="label-caps" style={{ fontSize: 8, color: isActive ? 'var(--gold-dim)' : 'var(--text-muted)' }}>
                              {entry.category?.toUpperCase()}
                            </span>
                            {entry.isCustom && (
                              <>
                                <span style={{ color: 'var(--border-subtle)', fontSize: 8 }}>·</span>
                                <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>CUSTOM</span>
                              </>
                            )}
                          </div>
                        </div>
                        {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Footer stats ─── */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--surface-container)' }}>
            <span className="label-caps" style={{ fontSize: 8 }}>{filteredCatalog.length} items</span>
            {uploadedGarments.length > 0 && (
              <span className="label-caps" style={{ fontSize: 8, color: 'var(--gold-dim)' }}>{uploadedGarments.length} custom</span>
            )}
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════
            CENTER: NEURAL VIEWPORT
            ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface-dim)' }}>
          {/* Control bar */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-low)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={handleGenerateFit} disabled={isGenerating} className="btn-gold"
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, padding: '9px 22px', opacity: isGenerating ? 0.7 : 1 }}
              >
                <Sparkles size={12} />
                {isGenerating ? 'SYNTHESIZING...' : 'EXECUTE RENDER'}
              </button>
              {generatedImageUrl && !isGenerating && (
                <button onClick={() => setGeneratedImageUrl(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: 9, cursor: 'pointer', padding: '8px 14px', letterSpacing: '0.12em', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', transition: 'all 0.2s' }}
                >
                  <RotateCcw size={9} /> RESET
                </button>
              )}
            </div>
            {bodyProfile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={11} style={{ color: 'var(--gold)' }} />
                <span className="label-caps" style={{ fontSize: 9, color: 'var(--gold-dim)' }}>NEURAL PROFILE ACTIVE</span>
              </div>
            )}
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, overflow: 'hidden' }}>
            <div style={{ width: '100%', maxWidth: 380, aspectRatio: '3/4', position: 'relative', overflow: 'hidden', background: 'var(--surface-container)', border: '1px solid var(--border-subtle)', boxShadow: '0 0 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(201,168,76,0.06)' }}>
              {/* Corner reticles */}
              {(['tl','tr','bl','br'] as const).map(c => (
                <div key={c} style={{ position: 'absolute', width: 14, height: 14, [c.includes('t') ? 'top' : 'bottom']: 10, [c.includes('l') ? 'left' : 'right']: 10, borderTop: c.includes('t') ? '1px solid rgba(201,168,76,0.45)' : undefined, borderBottom: c.includes('b') ? '1px solid rgba(201,168,76,0.45)' : undefined, borderLeft: c.includes('l') ? '1px solid rgba(201,168,76,0.45)' : undefined, borderRight: c.includes('r') ? '1px solid rgba(201,168,76,0.45)' : undefined, pointerEvents: 'none', zIndex: 10 }} />
              ))}

              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', inset: 0, background: '#0D0A10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, overflow: 'hidden' }}
                  >
                    <motion.div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--gold-dim), transparent)', opacity: 0.6 }} animate={{ top: ['0%', '100%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }} />
                    <motion.div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)',
                        mixBlendMode: 'screen',
                      }}
                      animate={{ opacity: [0.2, 0.35, 0.2] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    />
                    <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 220, textAlign: 'center' }}>
                      <motion.div animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', margin: '0 auto 22px', boxShadow: '0 0 20px var(--gold-dim)' }} />
                      <div className="label-caps" style={{ color: 'var(--gold-dim)', fontSize: 10, marginBottom: 14 }}>
                        {generationPhase === 'queued' ? 'INITIALIZING ENGINE' : generationPhase === 'processing' ? 'NEURAL COMPOSITOR ACTIVE' : 'HOLOGRAPHIC REVEAL'}
                      </div>
                      <div className="label-caps" style={{ color: 'var(--text-muted)', fontSize: 8, marginBottom: 10 }}>
                        STAGE: {stageLabel}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(201,168,76,0.4)', fontFamily: 'var(--font-mono)', marginBottom: 20, minHeight: 24 }}>
                        {'> '}{progressDetail || 'Loading neural render engine...'}
                      </div>
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', position: 'relative', marginBottom: 8 }}>
                        <motion.div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'linear-gradient(90deg, var(--gold-deep), var(--gold))' }} animate={{ width: `${Math.max(progressPct, 2)}%` }} transition={{ ease: 'linear', duration: 0.3 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <motion.span
                          className="label-caps"
                          style={{ fontSize: 8, color: 'var(--text-dim)' }}
                          animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.04, 1] }}
                          transition={{ duration: 1.1, repeat: Infinity }}
                        >
                          RTX LOCAL
                        </motion.span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold-dim)' }}>{progressPct}% · {elapsedSeconds}s</span>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                        <span>Step {Math.min(currentStep, totalSteps)}/{totalSteps}</span>
                        <span>ETA {estimatedRemaining !== null ? `${estimatedRemaining}s` : '--'}</span>
                      </div>
                    </div>
                  </motion.div>
                ) : generatedImageUrl ? (
                  <motion.div key="result" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: revealDuration, ease: [0.16, 1, 0.3, 1] }} style={{ position: 'absolute', inset: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={generatedImageUrl} alt="Result" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(201,168,76,0.08), transparent)', pointerEvents: 'none' }} />
                  </motion.div>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {activeGarment && (
                      <div style={{ position: 'absolute', inset: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={activeGarment} alt="Garment" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(80%) brightness(0.35)' }} />
                      </div>
                    )}
                    <div style={{ position: 'relative', zIndex: 5, textAlign: 'center' }}>
                      <div style={{ width: 1, height: 36, background: 'linear-gradient(to bottom, transparent, var(--gold-dim))', margin: '0 auto 18px' }} />
                      <div className="label-caps" style={{ color: 'var(--text-primary)', marginBottom: 6 }}>Awaiting Execution</div>
                      <div className="label-caps" style={{ color: 'var(--text-muted)', fontSize: 8 }}>Select an item & execute render</div>
                      <div style={{ width: 1, height: 36, background: 'linear-gradient(to bottom, var(--gold-dim), transparent)', margin: '18px auto 0' }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Active garment label */}
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-low)', flexShrink: 0 }}>
            <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>ACTIVE</span>
            <div style={{ width: 1, height: 10, background: 'var(--border-subtle)' }} />
            <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
              {activeEntry?.name ?? 'Custom Upload'}
            </span>
            {activeEntry && (
              <>
                <div style={{ width: 1, height: 10, background: 'var(--border-subtle)' }} />
                <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>{activeEntry.category?.toUpperCase()}</span>
              </>
            )}
          </div>
          <div style={{ padding: '10px 20px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-low)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>RECENT RENDERS</span>
              <span className="label-caps" style={{ fontSize: 8, color: 'var(--gold-dim)' }}>LAST {Math.min(renderHistory.length, 3)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, idx) => {
                const item = renderHistory[idx];
                if (!item) {
                  return <div key={`empty-${idx}`} style={{ aspectRatio: '3/4', border: '1px dashed var(--border-subtle)', opacity: 0.5 }} />;
                }
                return (
                  <button
                    key={item.imageUrl}
                    type="button"
                    onClick={() => restoreHistoryRender(item)}
                    style={{
                      position: 'relative',
                      aspectRatio: '3/4',
                      overflow: 'hidden',
                      border: '1px solid rgba(201,168,76,0.25)',
                      background: '#120e14',
                      cursor: 'pointer',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbUrl ?? item.imageUrl} alt={item.garmentName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', insetInline: 0, bottom: 0, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.8))', padding: '6px 5px', textAlign: 'left' }}>
                      <div className="label-caps" style={{ fontSize: 7, color: 'var(--gold-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.fitScore.toFixed(1)} · {item.garmentName}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT: FIT INTELLIGENCE PANEL
            ══════════════════════════════════════════════════════ */}
        <aside style={{ borderLeft: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence mode="wait">
            <FitPanel catalogEntry={GARMENT_CATALOG[activeCatalogIdx] ?? null} />
          </AnimatePresence>
        </aside>
      </div>
    </main>
  );
}

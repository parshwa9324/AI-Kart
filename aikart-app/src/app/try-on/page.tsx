'use client';

/**
 * AR Try-On Page — B2B SaaS Premium Interface
 *
 * - Integrated Framer Motion page transitions
 * - Glassmorphism UI using PremiumCard components
 * - Live size recommendations via SizeEngine in FitPanel
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { GARMENT_CATALOG } from '../../data/GarmentCatalog';
import { usePoseStore } from '../../store/PoseStore';
import { motion, AnimatePresence } from 'framer-motion';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { Camera, Image as ImageIcon, Sparkles, History, Box, CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import BodyCalibrationModal from '../../components/ui/BodyCalibrationModal';
import FitPanel from '../../components/ui/FitPanel';
import { AIKartAPI } from '@/ar-engine/APIClient';
import type { ProgressCallback } from '@/ar-engine/APIClient';

export default function TryOnPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeGarment, setActiveGarment] = useState(GARMENT_CATALOG[0].displayUrl);
  const [showCalibration, setShowCalibration] = useState(false);
  const [activeCatalogIdx, setActiveCatalogIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [uploadedGarments, setUploadedGarments] = useState<{ name: string; url: string }[]>([]);

  // Enterprise Phase 16: Real-time GPU progress tracking
  const [progressPct, setProgressPct] = useState(0);
  const [progressDetail, setProgressDetail] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [generationPhase, setGenerationPhase] = useState<'queued' | 'processing' | 'uploading'>('queued');
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bodyProfile = usePoseStore(s => s.bodyProfile);

  // Elapsed time counter — ticks every 100ms for smooth display
  useEffect(() => {
    if (isGenerating) {
      const start = Date.now();
      elapsedRef.current = setInterval(() => {
        setElapsedSeconds(+(((Date.now() - start) / 1000).toFixed(1)));
      }, 100);
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [isGenerating]);

  const handleGenerateFit = async () => {
    if (!bodyProfile) {
      alert("Please Create a Digital Profile first by clicking the 'Create Digital Profile' button.");
      return;
    }

    setIsGenerating(true);
    setGeneratedImageUrl(null);
    setProgressPct(0);
    setProgressDetail('');
    setElapsedSeconds(0);
    setGenerationPhase('queued');

    try {
      const userPhotoPlaceholder = "base64_encoded_photo_data_from_webcam";

      // Enterprise progress callback — streams live GPU worker progress to the UI
      const onProgress: ProgressCallback = (update) => {
        setProgressPct(update.progressPct);
        if (update.detail) setProgressDetail(update.detail);

        // Map status to generation phase for the spinner
        if (update.status === 'queued') setGenerationPhase('queued');
        else if (update.status === 'processing' || update.status === 'retrying') setGenerationPhase('processing');
        else if (update.progressPct >= 95) setGenerationPhase('uploading');
      };

      setGenerationPhase('processing');
      const response = await AIKartAPI.renderTryOn(
        {
          userPhoto: userPhotoPlaceholder,
          garmentId: GARMENT_CATALOG[activeCatalogIdx].defaultSpec.id,
          includeRecommendation: true
        },
        onProgress
      );

      // Final reveal animation
      setGenerationPhase('uploading');
      setProgressPct(100);
      if (response.imageUrl) {
        await new Promise(r => setTimeout(r, 500));
        setGeneratedImageUrl(response.imageUrl);
      }
    } catch (error) {
      console.error("Try-On ML Render Failed:", error);
      alert("Neural Engine unavailable. Is the Python backend running on port 8001?");
    } finally {
      setIsGenerating(false);
    }
  };

  const selectGarment = useCallback((url: string) => {
    setActiveGarment(url);
    setGeneratedImageUrl(null); // Clear previous generation when switching
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a local object URL to display the newly uploaded "custom" garment
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    setUploadedGarments(prev => [...prev, { name, url }]);
    setActiveGarment(url);
    setGeneratedImageUrl(null);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Animation variants
  const pageVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <main className="min-h-screen text-[var(--foreground)] bg-[var(--background)] font-sans selection:bg-white selection:text-black overflow-x-hidden p-4 md:p-8">
      <BodyCalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} />

      <motion.div
        className="max-w-[1400px] mx-auto relative z-10"
        initial="hidden"
        animate="visible"
        variants={pageVariants}
      >
        {/* Top Navigation Bar */}
        <motion.header variants={itemVariants} className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 bg-white flex items-center justify-center">
              <Box className="w-4 h-4 text-black" />
            </div>
            <div>
              <h1 className="text-sm font-medium tracking-wide text-white">AI-KART / B2B</h1>
              <p className="text-[10px] uppercase font-mono text-[var(--text-muted)]">Virtual Try-On Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <AnimatedButton
              variant="outline"
              onClick={() => setShowCalibration(true)}
              className={cn(
                "py-2 px-6 text-[10px] uppercase tracking-cinematic border-[var(--border-default)] bg-transparent hover:bg-white hover:text-black transition-colors rounded-none",
                bodyProfile ? "border-white text-white" : "text-[var(--text-secondary)]"
              )}
            >
              {bodyProfile ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Profile Active: {bodyProfile.heightCm}cm
                </div>
              ) : (
                "Create Digital Profile"
              )}
            </AnimatedButton>
          </div>
        </motion.header>

        {/* Main Interface Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column: Garment Catalog & Upload */}
          <motion.div variants={itemVariants} className="lg:col-span-3 flex flex-col gap-6">
            <PremiumCard className="p-0 border-none bg-transparent">
              <h3 className="text-[10px] font-mono tracking-widest text-[var(--text-secondary)] mb-4 flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
                [CATALOG_INDEX]
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {GARMENT_CATALOG.map((entry, idx) => (
                  <button
                    key={entry.name}
                    onClick={() => {
                      setActiveCatalogIdx(idx);
                      selectGarment(entry.displayUrl);
                    }}
                    className={cn(
                      "relative aspect-square overflow-hidden border transition-colors duration-300 group bg-[var(--surface-primary)]",
                      activeCatalogIdx === idx ? "border-white" : "border-[var(--border-default)] hover:border-[var(--text-muted)]"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.displayUrl}
                      alt={entry.name}
                      className="w-full h-full object-cover opacity-80 transition-opacity duration-500 group-hover:opacity-100 grayscale hover:grayscale-0"
                    />
                    {activeCatalogIdx === idx && (
                      <div className="absolute inset-0 bg-[#D4AF37]/10 mix-blend-overlay" />
                    )}
                  </button>
                ))}
                {/* Uploaded Custom Garments */}
                {uploadedGarments.map((ug, idx) => (
                  <button
                    key={`uploaded-${idx}`}
                    onClick={() => {
                      setActiveCatalogIdx(-1);
                      selectGarment(ug.url);
                    }}
                    className={cn(
                      "relative aspect-square overflow-hidden border transition-colors duration-300 group bg-[var(--surface-primary)]",
                      activeGarment === ug.url ? "border-white" : "border-dashed border-[var(--border-default)] hover:border-[var(--text-muted)]"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ug.url}
                      alt={ug.name}
                      className="w-full h-full object-cover opacity-80 transition-opacity duration-500 group-hover:opacity-100 grayscale hover:grayscale-0"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/90 px-2 py-1.5 text-[9px] font-mono text-[var(--text-secondary)] truncate border-t border-[var(--border-subtle)]">
                      {ug.name}
                    </div>
                    {activeGarment === ug.url && (
                      <div className="absolute inset-0 border-2 border-white pointer-events-none" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.glb"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  className="w-full py-3 text-[10px] uppercase font-mono tracking-cinematic text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-white hover:text-black hover:border-white transition-all"
                  onClick={() => fileInputRef.current?.click()}
                >
                  UPLOAD_CUSTOM
                </button>
              </div>
            </PremiumCard>
          </motion.div>

          {/* Center Column: AR Viewport / Neutral Render Image */}
          <motion.div variants={itemVariants} className="lg:col-span-6 flex flex-col items-center">

            {/* Control Bar */}
            <div className="w-full pb-4 mb-4 flex justify-between items-center border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleGenerateFit}
                  disabled={isGenerating}
                  className="py-2.5 px-8 text-[10px] uppercase tracking-cinematic bg-white text-black hover:bg-[#E0E0E0] transition-colors font-medium cursor-pointer disabled:opacity-50"
                >
                  {isGenerating ? "SYNTHESIZING..." : "EXECUTE RENDER"}
                </button>
              </div>

              {generatedImageUrl && (
                <div className="flex items-center justify-end gap-3 flex-1">
                  <button
                    onClick={() => setGeneratedImageUrl(null)}
                    className="py-2.5 px-6 text-[10px] uppercase font-mono text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] hover:text-white hover:border-white transition-colors flex items-center content-center"
                  >
                    RESET
                  </button>
                </div>
              )}
            </div>

            {/* Viewport Box */}
            <div className="w-full relative bg-[var(--surface-primary)] border border-[var(--border-default)] aspect-[3/4] group overflow-hidden">

              {isGenerating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--background)]">
                  <div className="w-full max-w-sm">
                    <div className="flex justify-between text-[10px] font-mono text-[var(--text-secondary)] mb-2 uppercase border-b border-[var(--border-subtle)] pb-2">
                       <span>{generationPhase === 'queued' ? 'SYS_QUEUE' : generationPhase === 'processing' ? 'SYS_RENDER' : 'SYS_UPLOAD'}</span>
                       <span>{elapsedSeconds.toFixed(1)}s</span>
                    </div>
                    <div className="text-left text-[10px] font-mono text-[var(--text-muted)] mb-4 min-h-[40px]">
                      &gt; {progressDetail || 'INITIALIZING NEURAL COMPOSITING...'}
                    </div>
                    <div className="h-[1px] w-full bg-[var(--border-subtle)] relative">
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-white transition-all duration-300"
                        style={{ width: `${Math.max(progressPct, 1)}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] font-mono text-white mt-2">
                      {progressPct}%
                    </div>
                  </div>
                </div>
              ) : generatedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={generatedImageUrl}
                  alt="Generated Try-On Result"
                  className="w-full h-full object-cover transition-opacity duration-1000 animate-in fade-in grayscale hover:grayscale-0"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent transition-all duration-500 border border-dashed border-[var(--border-subtle)] m-4">
                  <div className="w-4 h-4 bg-white mb-6" />
                  <p className="text-white text-xs tracking-cinematic uppercase">Awaiting Execution</p>
                  <p className="text-[var(--text-muted)] text-[10px] font-mono uppercase tracking-widest mt-4 text-center max-w-[250px]">
                    SELECT_ITEM &amp; EXECUTE RENDER
                  </p>
                </div>
              )}

            </div>

          </motion.div>

          {/* Right Column: Size Intelligence Engine */}
          <motion.div variants={itemVariants} className="lg:col-span-3 flex justify-end">
            <AnimatePresence mode="wait">
              <FitPanel catalogEntry={GARMENT_CATALOG[activeCatalogIdx] ?? null} />
            </AnimatePresence>
          </motion.div>

        </div>
      </motion.div>
    </main>
  );
}

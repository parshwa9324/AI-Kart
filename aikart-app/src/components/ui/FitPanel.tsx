'use client';

/**
 * FitPanel.tsx — Size Recommendation Visualization (B2B SaaS Premium UI)
 *
 * Replaces basic HTML with highly animated Data Gauges,
 * glassmorphism cards, and sophisticated data visualization.
 */

import { useEffect, useState, useMemo } from 'react';
import { usePoseStore } from '../../store/PoseStore';
import { analyzeGarmentFit, recommendSize } from '../../ar-engine/SizeEngine';
import type { SizeRecommendation, FitClassification, SizeLabel } from '../../types/types';
import type { CatalogEntry } from '../../data/GarmentCatalog';
import { PremiumCard } from './PremiumCard';
import { DataGauge } from './DataGauge';
import { motion, AnimatePresence } from 'framer-motion';
import { Ruler, Sparkles, MoveRight, Layers, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// Brand config mock injected into the UI (would come from SaaSClient in prod)
const MOCK_BRAND_CONFIG = {
    id: "brand_luxury_x",
    name: "Maison Luxe",
    slug: "maison-luxe",
    returnRiskThresholds: {
        mediumRiskMinGap: 2.0,
        highRiskMinGap: 4.0,
    },
    supportedDimensions: ["chest", "waist", "shoulders", "length", "sleeves"],
    features: {
        enableVirtualTryOn: true,
        requireApprovalForUploads: true,
        showDataQualityScore: true,
    },
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: "2023-01-01T00:00:00Z",
};

interface Props {
    catalogEntry: CatalogEntry | null;
}

const FIT_COLORS: Record<FitClassification, 'rose' | 'amber' | 'emerald' | 'blue' | 'white'> = {
    TOO_TIGHT: 'rose',
    SNUG: 'amber',
    REGULAR: 'emerald',
    RELAXED: 'blue',
    OVERSIZED: 'blue',
};

const FIT_LABELS: Record<FitClassification, string> = {
    TOO_TIGHT: 'Too Tight',
    SNUG: 'Snug',
    REGULAR: 'Perfect Fit',
    RELAXED: 'Relaxed',
    OVERSIZED: 'Oversized',
};

const DIMENSION_LABELS: Record<string, string> = {
    chestWidth: 'Chest',
    waistWidth: 'Waist',
    shoulderWidth: 'Shoulders',
    garmentLength: 'Length',
    sleeveLength: 'Sleeves',
};

export default function FitPanel({ catalogEntry }: Props) {
    const bodyProfile = usePoseStore(s => s.bodyProfile);
    const setSizeRecommendation = usePoseStore(s => s.setSizeRecommendation);
    const [selectedSize, setSelectedSize] = useState<SizeLabel>('M');
    const [recommendation, setRecommendation] = useState<SizeRecommendation | null>(null);
    const [bestSizeResult, setBestSizeResult] = useState<SizeRecommendation | null>(null);

    // Compute recommendations when body or garment changes
    useEffect(() => {
        if (!bodyProfile || !catalogEntry) {
            setRecommendation(null);
            setBestSizeResult(null);
            setSizeRecommendation(null);
            return;
        }

        // Find best size across all available, using the SaaS brand strictness
        const best = recommendSize(bodyProfile.measurements, catalogEntry.sizes, MOCK_BRAND_CONFIG);
        setBestSizeResult(best);

        if (best) {
            setSelectedSize(best.recommendedSize);
            setSizeRecommendation(best);
        }
    }, [bodyProfile, catalogEntry, setSizeRecommendation]);

    // Recompute when selected size changes
    useEffect(() => {
        if (!bodyProfile || !catalogEntry) return;

        const garment = catalogEntry.sizes.find(s => s.sizeLabel === selectedSize);
        if (!garment) return;

        const rec = analyzeGarmentFit(bodyProfile.measurements, garment, MOCK_BRAND_CONFIG);
        setRecommendation(rec);
    }, [bodyProfile, catalogEntry, selectedSize]);

    // Empty States
    if (!bodyProfile) {
        return (
            <PremiumCard className="p-8 text-center max-w-sm mx-auto mt-8 flex flex-col items-center bg-[var(--surface-primary)] border-none">
                <div className="w-8 h-8 flex items-center justify-center mb-6 text-white border border-[var(--border-default)]">
                    <Ruler className="w-4 h-4" />
                </div>
                <h3 className="text-white text-[10px] tracking-cinematic mb-2 uppercase">Profile Required / CALIBRATION</h3>
                <p className="text-[var(--text-secondary)] text-[10px] uppercase font-mono tracking-widest leading-relaxed">System awaiting physical dimension input for telemetry.</p>
            </PremiumCard>
        );
    }

    if (!catalogEntry || !recommendation) {
        return (
            <PremiumCard className="p-8 text-center max-w-sm mx-auto mt-8 flex flex-col items-center bg-[var(--surface-primary)] border-none">
                <div className="w-8 h-8 flex items-center justify-center mb-6 text-white border border-[var(--border-default)]">
                    <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-white text-[10px] tracking-cinematic mb-2 uppercase">Awaiting Selection</h3>
                <p className="text-[var(--text-secondary)] text-[10px] uppercase font-mono tracking-widest leading-relaxed">Select a garment from the catalog to initialize fit engine.</p>
            </PremiumCard>
        );
    }

    const colorKey = FIT_COLORS[recommendation.overallFit];
    const bestSize = bestSizeResult?.recommendedSize;

    return (
        <PremiumCard className="w-[360px] overflow-visible bg-[var(--surface-primary)] border border-[var(--border-default)] rounded-none shadow-none">

            {/* SaaS Data Quality Head */}
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white animate-pulse" />
                    <span className="text-[10px] font-mono tracking-widest text-[var(--text-secondary)] uppercase">AI_ENGINE / TELEMETRY</span>
                </div>
                {recommendation.dataQuality !== undefined && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-mono text-[var(--text-muted)] tracking-widest">
                            CONFIDENCE: {recommendation.dataQuality}%
                        </span>
                    </div>
                )}
            </div>

            <div className="p-6 space-y-8">

                <div className="border-b border-[var(--border-subtle)] pb-4 mb-6 flex justify-between items-end">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Target Object</span>
                    <span className="text-xs tracking-cinematic text-white uppercase">{catalogEntry.name}</span>
                </div>

                {/* Visual Gauge Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[10px] uppercase font-mono tracking-widest text-[var(--text-muted)] mb-2">Optimal Matrix</div>
                        <div className="flex items-baseline gap-3">
                            <span className="text-5xl font-light tracking-tight text-white leading-none">{bestSize ?? selectedSize}</span>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-white border border-white px-1.5 py-0.5">Selected</span>
                        </div>
                    </div>

                    {/* The New Animated Gauge */}
                    <DataGauge
                        value={recommendation.confidenceScore}
                        label="Confidence"
                        size="sm"
                        color={colorKey}
                    />
                </div>

                {/* Return Risk Enterprise Badge */}
                <div className="border border-[var(--border-default)] p-4 relative">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border-subtle)]">
                        <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase">
                            Risk Assessment
                        </span>
                        <span className={cn(
                            "text-[10px] font-mono uppercase tracking-widest",
                            recommendation.returnRisk === 'low' ? "text-white" :
                                recommendation.returnRisk === 'medium' ? "text-[var(--text-secondary)]" : "text-[var(--text-dim)]"
                        )}>
                            Level: {recommendation.returnRisk}
                        </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] uppercase font-mono leading-relaxed mt-2 tracking-wide">
                        {recommendation.returnRisk === 'low' ? "PHYSICAL TOLERANCES MET. HIGH PROBABILITY OF NOMINAL FIT." :
                            recommendation.returnRisk === 'medium' ? "DIMENSIONS TEST NOMINAL THRESHOLDS. MINOR DEVIATION POSSIBLE." :
                                "VIOLATES BRAND CAD PHYSICAL STRICTNESS STANDARD. REJECT."}
                    </p>
                </div>

                {/* Size Carousel Options */}
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] mb-3 pb-2 border-b border-[var(--border-subtle)]">Compare Matrices</div>
                    <div className="flex gap-2">
                        {catalogEntry.sizes.map(s => {
                            const isSelected = selectedSize === s.sizeLabel;
                            const isBest = bestSize === s.sizeLabel;
                            return (
                                <button
                                    key={s.sizeLabel}
                                    onClick={() => setSelectedSize(s.sizeLabel)}
                                    className={cn(
                                        "relative flex-1 py-3 text-sm font-light transition-all duration-300",
                                        "border",
                                        isSelected
                                            ? "bg-white text-black border-white"
                                            : "bg-transparent text-[var(--text-secondary)] border-[var(--border-default)] hover:border-white hover:text-white"
                                    )}
                                >
                                    {s.sizeLabel}
                                    {isBest && !isSelected && (
                                        <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Granular Dimension Breakdown */}
                <div>
                    <div className="text-[10px] font-mono tracking-widest text-[var(--text-secondary)] mb-4 flex justify-between border-b border-[var(--border-subtle)] pb-2 uppercase">
                        <span>Physical Telemetry</span>
                        <span>Delta (mm)</span>
                    </div>
                    <div className="space-y-4">
                        <AnimatePresence mode="popLayout">
                            {recommendation.measurements.map(m => (
                                <motion.div
                                    key={m.dimension}
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="group"
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] tracking-widest uppercase font-mono text-white">
                                            {DIMENSION_LABELS[m.dimension] ?? m.dimension}
                                        </span>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
                                                {FIT_LABELS[m.fit]}
                                            </span>
                                            <span className="text-[10px] font-mono text-white min-w-[30px] text-right">
                                                {m.effectiveGap > 0 ? '+' : ''}{(m.effectiveGap * 10).toFixed(0)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Minimalist Progress Track */}
                                    <div className="h-[2px] bg-[var(--border-default)] w-full relative">
                                        <div className="absolute top-[-2px] bottom-[-2px] left-1/2 w-[1px] bg-[var(--text-dim)] -translate-x-1/2 z-10" />
                                        <motion.div
                                            initial={{ width: '50%' }}
                                            animate={{
                                                width: `${Math.max(0, Math.min(100, 50 + (m.effectiveGap * 2.5)))}%`, // Map gap to 0-100% spread
                                            }}
                                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                            className="h-full bg-white opacity-80"
                                        />
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Footer Insight */}
                <div className="pt-6 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-dim)] uppercase font-mono tracking-widest leading-relaxed">
                    [SYS_REPORT] {recommendation.summary}
                </div>
            </div>
        </PremiumCard>
    );
}

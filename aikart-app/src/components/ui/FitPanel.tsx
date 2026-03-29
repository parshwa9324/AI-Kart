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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid var(--border-gold)', color: 'var(--gold)' }}>
                    <Ruler size={16} />
                </div>
                <div className="label-caps" style={{ color: 'var(--gold-dim)', marginBottom: 12 }}>Profile Required</div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', lineHeight: 1.7 }}>Create a Digital Profile to enable neural fit analysis.</p>
            </div>
        );
    }

    if (!catalogEntry || !recommendation) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid rgba(201,168,76,0.3)', color: 'var(--gold)' }}>
                    <ShieldCheck size={16} />
                </div>
                <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: 12, letterSpacing: '0.1em' }}>Physical Twin Active ✓</div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', lineHeight: 1.7 }}>Select a garment to initialize the neural fit intelligence engine.</p>
            </div>
        );
    }

    const colorKey = FIT_COLORS[recommendation.overallFit];
    const bestSize = bestSizeResult?.recommendedSize;

    return (
        <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--surface-low)', display: 'flex', flexDirection: 'column' }}>

            {/* Panel Header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-container)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)', animation: 'gold-pulse 2s infinite' }} />
                    <span className="label-caps" style={{ fontSize: 9 }}>FIT INTELLIGENCE</span>
                </div>
                {recommendation.dataQuality !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(201,168,76,0.08)', border: '1px solid var(--border-gold)' }}>
                        <span className="label-caps" style={{ fontSize: 8, color: 'var(--gold-dim)' }}>CONF {recommendation.dataQuality}%</span>
                    </div>
                )}
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <span className="label-caps" style={{ fontSize: 8 }}>Target Garment</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>{catalogEntry.name}</span>
                </div>

                {/* Primary size recommendation */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div className="label-caps" style={{ fontSize: 8, marginBottom: 10 }}>Recommended Size</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <span className="text-gold" style={{ fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}>{bestSize ?? selectedSize}</span>
                            <div style={{ padding: '3px 8px', background: 'rgba(201,168,76,0.1)', border: '1px solid var(--border-gold)' }}>
                                <span className="label-caps" style={{ fontSize: 8, color: 'var(--gold-dim)' }}>OPTIMAL</span>
                            </div>
                        </div>
                    </div>
                    <DataGauge value={recommendation.confidenceScore} label="Confidence" size="sm" color={colorKey} />
                </div>

                {/* Return risk badge */}
                <div style={{
                    padding: 16, position: 'relative',
                    background: recommendation.returnRisk === 'low' ? 'rgba(201,168,76,0.05)' : 'rgba(255,180,171,0.04)',
                    border: `1px solid ${recommendation.returnRisk === 'low' ? 'var(--border-gold)' : 'rgba(255,180,171,0.2)'}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                        <span className="label-caps" style={{ fontSize: 8 }}>Return Risk</span>
                        <span className="label-caps" style={{ fontSize: 8, color: recommendation.returnRisk === 'low' ? 'var(--gold)' : recommendation.returnRisk === 'medium' ? 'var(--text-secondary)' : 'var(--danger)' }}>
                            {recommendation.returnRisk?.toUpperCase()}
                        </span>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6, letterSpacing: '0.04em' }}>
                        {recommendation.returnRisk === 'low' ? 'Physical tolerances met. High probability of nominal fit.' :
                            recommendation.returnRisk === 'medium' ? 'Dimensions near nominal thresholds. Minor deviation possible.' :
                                'Violates brand physical strictness standard.'}
                    </p>
                </div>

                {/* Size options */}
                <div>
                    <div className="label-caps" style={{ fontSize: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>Compare Sizes</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {catalogEntry.sizes.map(s => {
                            const isSelected = selectedSize === s.sizeLabel;
                            const isBest = bestSize === s.sizeLabel;
                            return (
                                <button key={s.sizeLabel} onClick={() => setSelectedSize(s.sizeLabel)}
                                    style={{
                                        flex: 1, padding: '12px 4px', fontSize: 13,
                                        fontFamily: 'var(--font-serif)', fontWeight: 300,
                                        border: isSelected ? '1px solid var(--gold)' : '1px solid var(--border-default)',
                                        background: isSelected ? 'rgba(201,168,76,0.1)' : 'transparent',
                                        color: isSelected ? 'var(--gold)' : 'var(--text-secondary)',
                                        cursor: 'pointer', position: 'relative',
                                        transition: 'all 0.25s',
                                    }}
                                >
                                    {s.sizeLabel}
                                    {isBest && !isSelected && (
                                        <div style={{ position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: '50%', background: 'var(--gold)' }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Dimension breakdown */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                        <span className="label-caps" style={{ fontSize: 8 }}>Physical Telemetry</span>
                        <span className="label-caps" style={{ fontSize: 8 }}>Delta mm</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <AnimatePresence mode="popLayout">
                            {recommendation.measurements.map(m => (
                                <motion.div key={m.dimension} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
                                            {DIMENSION_LABELS[m.dimension] ?? m.dimension}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>{FIT_LABELS[m.fit]}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: m.effectiveGap > 0 ? 'var(--gold-dim)' : m.effectiveGap < -2 ? 'var(--danger)' : 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>
                                                {m.effectiveGap > 0 ? '+' : ''}{(m.effectiveGap * 10).toFixed(0)}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ height: 1, background: 'var(--border-subtle)', position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 1, background: 'var(--border-default)', transform: 'translateX(-50%)', zIndex: 2 }} />
                                        <motion.div
                                            initial={{ width: '50%' }}
                                            animate={{ width: `${Math.max(0, Math.min(100, 50 + (m.effectiveGap * 2.5)))}%` }}
                                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                            style={{ height: '100%', background: m.fit === 'REGULAR' ? 'linear-gradient(90deg, var(--gold-deep), var(--gold))' : m.fit === 'TOO_TIGHT' ? 'var(--danger)' : 'var(--text-muted)' }}
                                        />
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Insight footer */}
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="label-caps" style={{ fontSize: 8, color: 'var(--gold-dim)', marginBottom: 8 }}>SYS REPORT</div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6, letterSpacing: '0.04em' }}>{recommendation.summary}</p>
                </div>
            </div>
        </div>
    );
}

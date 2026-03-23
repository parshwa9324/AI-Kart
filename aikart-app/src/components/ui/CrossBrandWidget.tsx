'use client';

/**
 * CrossBrandWidget — Enterprise Cross-Brand Size Comparison
 *
 * Displays: "You're a Zegna M, Prada 48, LV L, Burberry M, Gucci 48"
 * Calls backend POST /api/v1/size/compare-brands
 */

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Globe2, RefreshCw } from 'lucide-react';

interface BrandResult {
    brandName: string;
    brandId: string;
    recommendedSize: string;
    fit: string;
    confidenceScore: number;
}

interface CrossBrandWidgetProps {
    bodyMeasurements?: {
        chestCircumference?: number;
        waistCircumference?: number;
        shoulderWidth?: number;
    };
    className?: string;
}

const FIT_COLORS: Record<string, string> = {
    REGULAR: 'text-emerald-400',
    SNUG: 'text-amber-400',
    RELAXED: 'text-blue-400',
    TOO_TIGHT: 'text-rose-400',
    OVERSIZED: 'text-violet-400',
};

const FIT_BG: Record<string, string> = {
    REGULAR: 'bg-emerald-500/10 border-emerald-500/20',
    SNUG: 'bg-amber-500/10 border-amber-500/20',
    RELAXED: 'bg-blue-500/10 border-blue-500/20',
    TOO_TIGHT: 'bg-rose-500/10 border-rose-500/20',
    OVERSIZED: 'bg-violet-500/10 border-violet-500/20',
};

export default function CrossBrandWidget({ bodyMeasurements, className = '' }: CrossBrandWidgetProps) {
    const [results, setResults] = useState<BrandResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState('');
    const [error, setError] = useState('');

    const fetchComparison = async () => {
        if (!bodyMeasurements?.chestCircumference) return;

        setLoading(true);
        setError('');
        try {
            const resp = await fetch('http://localhost:8001/api/v1/size/compare-brands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    body: {
                        chestCircumference: bodyMeasurements.chestCircumference,
                        waistCircumference: bodyMeasurements.waistCircumference,
                        shoulderWidth: bodyMeasurements.shoulderWidth,
                    },
                    brand_ids: [],
                }),
            });
            const data = await resp.json();
            setResults(data.results || []);
            setSummary(data.summary || '');
        } catch {
            setError('Backend unavailable');
            // Demo fallback
            setResults([
                { brandName: 'Ermenegildo Zegna', brandId: 'brand_zegna', recommendedSize: 'M', fit: 'REGULAR', confidenceScore: 85 },
                { brandName: 'Prada', brandId: 'brand_prada', recommendedSize: '48', fit: 'REGULAR', confidenceScore: 82 },
                { brandName: 'Louis Vuitton', brandId: 'brand_lvmh', recommendedSize: 'L', fit: 'SNUG', confidenceScore: 78 },
                { brandName: 'Burberry', brandId: 'brand_burberry', recommendedSize: 'M', fit: 'REGULAR', confidenceScore: 80 },
                { brandName: 'Gucci', brandId: 'brand_gucci', recommendedSize: '48', fit: 'REGULAR', confidenceScore: 83 },
            ]);
            setSummary('Demo: Zegna M, Prada 48, LV L, Burberry M, Gucci 48');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComparison();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bodyMeasurements?.chestCircumference]);

    if (!bodyMeasurements?.chestCircumference && results.length === 0) {
        return (
            <div className={`glass rounded-2xl p-5 ${className}`}>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2 mb-3">
                    <Globe2 className="w-4 h-4" /> Cross-Brand Sizing
                </h3>
                <p className="text-xs text-[var(--text-dim)]">Complete body profile to see your size across luxury brands.</p>
            </div>
        );
    }

    return (
        <div className={`glass rounded-2xl p-5 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-[var(--gold-400)]" /> Cross-Brand Sizing
                </h3>
                <button
                    onClick={fetchComparison}
                    disabled={loading}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-dim)] hover:text-white transition-all"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error && <p className="text-[10px] text-amber-400/60 mb-2">{error} — showing demo data</p>}

            <div className="flex overflow-x-auto gap-3 pb-2 -mx-1 px-1">
                {results.map((r, i) => (
                    <motion.div
                        key={r.brandId}
                        className={`flex-shrink-0 rounded-xl p-3 border ${FIT_BG[r.fit] || FIT_BG.REGULAR} min-w-[130px]`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.4 }}
                    >
                        <p className="text-[10px] font-serif italic text-[var(--text-secondary)] mb-1 truncate">{r.brandName}</p>
                        <p className="text-2xl font-bold text-white mb-1">{r.recommendedSize}</p>
                        <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold uppercase ${FIT_COLORS[r.fit] || 'text-white'}`}>
                                {r.fit}
                            </span>
                            <span className="text-[10px] text-[var(--text-dim)] tabular-nums">{r.confidenceScore}%</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {summary && (
                <p className="text-[10px] text-[var(--text-dim)] mt-3 italic">{summary}</p>
            )}
        </div>
    );
}

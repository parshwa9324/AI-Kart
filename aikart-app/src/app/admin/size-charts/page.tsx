'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Plus, Trash2, Edit3, TestTube2, Save, X } from 'lucide-react';

/* ── Mock Size Chart Data ──────────────────────────────────── */
const INITIAL_CHARTS = [
    {
        id: 'brand_zegna', name: 'Ermenegildo Zegna',
        sizes: [
            { label: 'S', chest: [86, 90], waist: [72, 76], shoulder: [42, 44] },
            { label: 'M', chest: [92, 96], waist: [78, 82], shoulder: [44, 46] },
            { label: 'L', chest: [98, 102], waist: [84, 88], shoulder: [46, 48] },
            { label: 'XL', chest: [104, 108], waist: [90, 94], shoulder: [48, 50] },
        ],
    },
    {
        id: 'brand_prada', name: 'Prada',
        sizes: [
            { label: '44', chest: [84, 88], waist: [70, 74], shoulder: [41, 43] },
            { label: '46', chest: [88, 92], waist: [74, 78], shoulder: [43, 45] },
            { label: '48', chest: [92, 96], waist: [78, 82], shoulder: [45, 47] },
            { label: '50', chest: [96, 100], waist: [82, 86], shoulder: [47, 49] },
            { label: '52', chest: [100, 104], waist: [86, 90], shoulder: [49, 51] },
        ],
    },
    {
        id: 'brand_lvmh', name: 'Louis Vuitton',
        sizes: [
            { label: 'XS', chest: [82, 86], waist: [68, 72], shoulder: [40, 42] },
            { label: 'S', chest: [86, 90], waist: [72, 76], shoulder: [42, 44] },
            { label: 'M', chest: [90, 94], waist: [76, 80], shoulder: [44, 46] },
            { label: 'L', chest: [94, 98], waist: [80, 84], shoulder: [46, 48] },
            { label: 'XL', chest: [98, 102], waist: [84, 88], shoulder: [48, 50] },
        ],
    },
];

const container = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

interface TestResult {
    brand: string;
    size: string;
    fit: string;
}

export default function SizeChartsPage() {
    const [charts] = useState(INITIAL_CHARTS);
    const [expandedBrand, setExpandedBrand] = useState<string | null>(INITIAL_CHARTS[0].id);
    const [testMode, setTestMode] = useState(false);
    const [testBody, setTestBody] = useState({ chest: '96', waist: '82', shoulder: '45' });
    const [testResults, setTestResults] = useState<TestResult[]>([]);

    const handleTest = () => {
        const c = parseFloat(testBody.chest);
        const w = parseFloat(testBody.waist);
        const s = parseFloat(testBody.shoulder);

        const results: TestResult[] = [];
        for (const chart of charts) {
            let bestSize = chart.sizes[0].label;
            let bestScore = -Infinity;
            for (const sz of chart.sizes) {
                const cMid = (sz.chest[0] + sz.chest[1]) / 2;
                const wMid = (sz.waist[0] + sz.waist[1]) / 2;
                const sMid = (sz.shoulder[0] + sz.shoulder[1]) / 2;
                const score = -(Math.abs(c - cMid) * 0.4 + Math.abs(w - wMid) * 0.35 + Math.abs(s - sMid) * 0.25);
                if (score > bestScore) { bestScore = score; bestSize = sz.label; }
            }
            const deviation = Math.abs(bestScore);
            results.push({
                brand: chart.name,
                size: bestSize,
                fit: deviation < 3 ? 'REGULAR' : deviation < 6 ? 'SNUG' : 'RELAXED',
            });
        }
        setTestResults(results);
    };

    return (
        <motion.div variants={container} initial="hidden" animate="visible">
            {/* Header */}
            <motion.div variants={item} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Size Charts</h1>
                    <p className="text-sm text-[var(--text-muted)]">Manage brand-specific size charts for accurate recommendations.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setTestMode(!testMode); setTestResults([]); }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${testMode
                            ? 'bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/30'
                            : 'glass text-[var(--text-secondary)] hover:text-white'
                            }`}
                    >
                        <TestTube2 className="w-4 h-4" /> {testMode ? 'Close Tester' : 'Test Against Body'}
                    </button>
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                             bg-gradient-to-r from-[var(--gold-500)] to-[var(--gold-600)] text-black
                             hover:scale-[1.02] active:scale-[0.98] transition-transform">
                        <Plus className="w-4 h-4" /> Add Brand
                    </button>
                </div>
            </motion.div>

            {/* Test Panel */}
            {testMode && (
                <motion.div
                    className="glass-gold rounded-2xl p-6 mb-6"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                >
                    <h3 className="text-sm font-bold text-[var(--gold-400)] mb-4">Body Measurement Tester</h3>
                    <div className="flex flex-wrap items-end gap-4">
                        {[
                            { key: 'chest', label: 'Chest (cm)' },
                            { key: 'waist', label: 'Waist (cm)' },
                            { key: 'shoulder', label: 'Shoulder (cm)' },
                        ].map((f) => (
                            <div key={f.key}>
                                <label className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] font-bold block mb-1.5">{f.label}</label>
                                <input
                                    type="number"
                                    value={testBody[f.key as keyof typeof testBody]}
                                    onChange={e => setTestBody(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    className="w-24 px-3 py-2 rounded-lg text-sm bg-black/30 border border-[var(--border-gold)]
                             text-white outline-none focus:ring-1 focus:ring-[var(--gold-500)] tabular-nums"
                                />
                            </div>
                        ))}
                        <button
                            onClick={handleTest}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
                         bg-[var(--gold-500)] text-black hover:bg-[var(--gold-400)] transition-colors"
                        >
                            <TestTube2 className="w-4 h-4" /> Run Test
                        </button>
                    </div>

                    {testResults.length > 0 && (
                        <div className="mt-5 flex flex-wrap gap-3">
                            {testResults.map(r => (
                                <div key={r.brand} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                                    <span className="text-sm font-serif italic text-[var(--text-secondary)]">{r.brand}</span>
                                    <span className="text-lg font-bold text-[var(--gold-400)]">{r.size}</span>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${r.fit === 'REGULAR' ? 'bg-emerald-500/15 text-emerald-400' :
                                        r.fit === 'SNUG' ? 'bg-amber-500/15 text-amber-400' :
                                            'bg-blue-500/15 text-blue-400'
                                        }`}>{r.fit}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Brand Size Charts */}
            <div className="space-y-4">
                {charts.map(chart => (
                    <motion.div key={chart.id} variants={item} className="glass rounded-2xl overflow-hidden">
                        {/* Brand Header */}
                        <button
                            onClick={() => setExpandedBrand(expandedBrand === chart.id ? null : chart.id)}
                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--surface-glass-hover)] transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[var(--gold-500)]/10 border border-[var(--gold-500)]/20
                                flex items-center justify-center">
                                    <span className="text-sm font-serif font-bold text-[var(--gold-400)]">{chart.name[0]}</span>
                                </div>
                                <div className="text-left">
                                    <h3 className="text-base font-semibold text-white">{chart.name}</h3>
                                    <p className="text-xs text-[var(--text-muted)]">{chart.sizes.length} sizes</p>
                                </div>
                            </div>
                            <motion.div
                                animate={{ rotate: expandedBrand === chart.id ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-[var(--text-dim)]"
                            >
                                ▾
                            </motion.div>
                        </button>

                        {/* Size Table */}
                        {expandedBrand === chart.id && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
                                className="border-t border-[var(--border-subtle)]"
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] font-bold">
                                                <th className="px-6 py-3 text-left">Size</th>
                                                <th className="px-6 py-3 text-left">Chest (cm)</th>
                                                <th className="px-6 py-3 text-left">Waist (cm)</th>
                                                <th className="px-6 py-3 text-left">Shoulder (cm)</th>
                                                <th className="px-6 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {chart.sizes.map((sz) => (
                                                <tr key={sz.label} className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-glass-hover)] transition-colors">
                                                    <td className="px-6 py-3">
                                                        <span className="text-sm font-bold text-[var(--gold-400)]">{sz.label}</span>
                                                    </td>
                                                    <td className="px-6 py-3 text-sm text-[var(--text-secondary)] tabular-nums">{sz.chest[0]} – {sz.chest[1]}</td>
                                                    <td className="px-6 py-3 text-sm text-[var(--text-secondary)] tabular-nums">{sz.waist[0]} – {sz.waist[1]}</td>
                                                    <td className="px-6 py-3 text-sm text-[var(--text-secondary)] tabular-nums">{sz.shoulder[0]} – {sz.shoulder[1]}</td>
                                                    <td className="px-6 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button className="p-1.5 rounded-md hover:bg-white/5 text-[var(--text-dim)] hover:text-white transition-colors">
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button className="p-1.5 rounded-md hover:bg-rose-500/10 text-[var(--text-dim)] hover:text-rose-400 transition-colors">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex justify-end">
                                    <button className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--gold-400)] transition-colors">
                                        <Plus className="w-3.5 h-3.5" /> Add Size
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Calendar, TrendingUp, ArrowDown, ArrowUp } from 'lucide-react';

/* ── Mock Analytics Data ───────────────────────────────────── */
const WEEKLY_TRYONS = [
    { day: 'Mon', count: 185 },
    { day: 'Tue', count: 220 },
    { day: 'Wed', count: 198 },
    { day: 'Thu', count: 310 },
    { day: 'Fri', count: 275 },
    { day: 'Sat', count: 340 },
    { day: 'Sun', count: 290 },
];

const RETURN_RISK = [
    { level: 'LOW', count: 847, pct: 66, color: 'var(--success)' },
    { level: 'MEDIUM', count: 321, pct: 25, color: 'var(--warning)' },
    { level: 'HIGH', count: 116, pct: 9, color: 'var(--danger)' },
];

const TOP_GARMENTS = [
    { name: 'Slim Fit Cotton Shirt', tryOns: 567, confidence: 91 },
    { name: 'Stretch Denim Jeans', tryOns: 489, confidence: 88 },
    { name: 'Jersey Polo Shirt', tryOns: 412, confidence: 94 },
    { name: 'Tailored Wool Blazer', tryOns: 342, confidence: 86 },
    { name: 'Linen Summer Shirt', tryOns: 298, confidence: 90 },
];

const CONFIDENCE_TREND = [82, 84, 85, 87, 86, 89, 90, 88, 91, 90, 92, 91];

const container = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function AnalyticsPage() {
    const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
    const maxTryOns = Math.max(...WEEKLY_TRYONS.map(d => d.count));

    return (
        <motion.div variants={container} initial="hidden" animate="visible">
            {/* Header */}
            <motion.div variants={item} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Analytics</h1>
                    <p className="text-sm text-[var(--text-muted)]">Performance metrics and sizing intelligence insights.</p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-glass)] border border-[var(--border-subtle)]">
                    {(['7d', '30d', '90d'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${period === p
                                ? 'bg-[var(--gold-500)]/15 text-[var(--gold-400)]'
                                : 'text-[var(--text-muted)] hover:text-white'
                                }`}
                        >
                            {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Summary Row */}
            <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total Try-Ons', value: '1,818', change: '+12.4%', up: true },
                    { label: 'Avg Confidence', value: '91%', change: '+3.2%', up: true },
                    { label: 'Return Risk Saved', value: '$24.7K', change: '+18%', up: true },
                    { label: 'Avg Latency', value: '2.4s', change: '-0.3s', up: false },
                ].map(s => (
                    <div key={s.label} className="glass rounded-xl p-4">
                        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] font-bold mb-2">{s.label}</p>
                        <p className="text-2xl font-bold text-white tabular-nums">{s.value}</p>
                        <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${s.up ? 'text-emerald-400' : 'text-blue-400'}`}>
                            {s.up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                            {s.change}
                        </p>
                    </div>
                ))}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                {/* Try-On Volume Chart */}
                <motion.div variants={item} className="glass rounded-2xl p-6">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-6 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Try-On Volume
                    </h3>
                    <div className="flex items-end gap-3 h-48">
                        {WEEKLY_TRYONS.map((d) => (
                            <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                                <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">{d.count}</span>
                                <motion.div
                                    className="w-full rounded-lg bg-gradient-to-t from-[var(--gold-600)] to-[var(--gold-400)]"
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(d.count / maxTryOns) * 100}%` }}
                                    transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
                                />
                                <span className="text-xs font-bold text-[var(--text-dim)]">{d.day}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Return Risk Distribution */}
                <motion.div variants={item} className="glass rounded-2xl p-6">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-6">Return Risk Distribution</h3>
                    <div className="space-y-5">
                        {RETURN_RISK.map((r) => (
                            <div key={r.level}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                                        <span className="text-sm font-semibold text-white">{r.level}</span>
                                    </div>
                                    <span className="text-sm text-[var(--text-secondary)] tabular-nums">{r.count} ({r.pct}%)</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ background: r.color }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${r.pct}%` }}
                                        transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                        <p className="text-xs text-[var(--text-muted)]">
                            <span className="text-emerald-400 font-bold">66%</span> of recommendations have LOW return risk — sizes are accurately matched.
                        </p>
                    </div>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Confidence Score Trend */}
                <motion.div variants={item} className="glass rounded-2xl p-6">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-6 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Avg Confidence Score Trend
                    </h3>
                    <div className="relative h-32">
                        <svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
                            {/* Grid lines */}
                            {[0, 1, 2, 3].map(i => (
                                <line key={i} x1="0" y1={i * 40} x2="400" y2={i * 40} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            ))}
                            {/* Area */}
                            <defs>
                                <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--gold-400)" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="var(--gold-400)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                d={`M ${CONFIDENCE_TREND.map((v, i) => `${(i / (CONFIDENCE_TREND.length - 1)) * 400},${120 - ((v - 75) / 25) * 120}`).join(' L ')} L 400,120 L 0,120 Z`}
                                fill="url(#confGrad)"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 1, delay: 0.5 }}
                            />
                            <motion.polyline
                                points={CONFIDENCE_TREND.map((v, i) => `${(i / (CONFIDENCE_TREND.length - 1)) * 400},${120 - ((v - 75) / 25) * 120}`).join(' ')}
                                fill="none"
                                stroke="var(--gold-400)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
                            />
                        </svg>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-[var(--text-dim)]">12 weeks ago</span>
                        <span className="text-xs text-[var(--text-dim)]">This week</span>
                    </div>
                </motion.div>

                {/* Top Garments */}
                <motion.div variants={item} className="glass rounded-2xl p-6">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-5">Most Popular Garments</h3>
                    <div className="space-y-1">
                        {TOP_GARMENTS.map((g, i) => (
                            <div key={g.name} className="flex items-center gap-4 px-3 py-2.5 rounded-lg hover:bg-[var(--surface-glass-hover)] transition-colors">
                                <span className="text-xs font-bold text-[var(--text-dim)] w-5 tabular-nums">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{g.name}</p>
                                </div>
                                <span className="text-xs text-[var(--text-secondary)] tabular-nums">{g.tryOns} try-ons</span>
                                <span className={`text-xs font-bold tabular-nums ${g.confidence >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {g.confidence}%
                                </span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AIKartAPI } from '@/ar-engine/APIClient';

/* ── Animated Terminal Counter ─────────────────────────────── */
function AnimCounter({ target, duration = 1500, decimals = 0 }: { target: number; duration?: number; decimals?: number }) {
    const [val, setVal] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const start = Date.now();
        const tick = () => {
            const p = Math.min((Date.now() - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 4);
            setVal(target * eased);
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [target, duration]);
    return <span ref={ref}>{decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString()}</span>;
}

/* ── Monochromatic Sparkline ─────────────────────────────────── */
function Sparkline({ data, color = 'white', height = 40 }: { data: number[]; color?: string; height?: number }) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 120;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
    return (
        <svg width={w} height={height} className="opacity-80 transition-opacity">
            <polyline points={points} fill="none" stroke={color} strokeWidth="1" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
    );
}

/* ── Static Mock Definitions ─────────────────────────────── */
const RECENT_ACTIVITY = [
    { time: 'T-02M', event: 'DIMENSION MATCH: NOMINAL', detail: 'IDM-VTON Render Comp. Latency: 2.8s' },
    { time: 'T-05M', event: 'DATA INGESTION: SUCCESS', detail: 'Cashmere Collection. 4 Assets.' },
    { time: 'T-12M', event: 'CROSS-BAND CALCULATION', detail: 'Zegna 48 → Prada M' },
    { time: 'T-18M', event: 'TOLERANCE ALERT', detail: 'Sleeve −3.2cm constraint violation.', warning: true },
    { time: 'T-25M', event: 'SYSTEM UPDATE', detail: 'Material stretch coefficients modified.' },
    { time: 'T-60M', event: 'SYS_CALL_BATCH: COMPLETE', detail: '500 renders processed. GPUs released.' },
];

const SIZE_DIST = [
    { label: '44', pct: 5 },
    { label: '46', pct: 18 },
    { label: '48', pct: 35 },
    { label: '50', pct: 28 },
    { label: '52', pct: 11 },
    { label: '54', pct: 3 },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
} as const;
const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] as any } },
} as const;

/* ══════════════════════════════════════════════════════════════
   ADMIN TERMINAL (Bloomberg Meets Loro Piana)
   ══════════════════════════════════════════════════════════════ */

export default function AdminDashboard() {
    // ── Live GPU State ──
    const [activeRenders, setActiveRenders] = useState(0);
    const [maxRenders, setMaxRenders] = useState(1);
    const [gpuDevice, setGpuDevice] = useState("SCANNING...");

    useEffect(() => {
        let isSubscribed = true;
        const fetchHealth = async () => {
            try {
                const h = await AIKartAPI.getGPUHealth() as Record<string, any>;
                if (isSubscribed) {
                    setActiveRenders(h.active_renders ?? 0);
                    setMaxRenders(h.max_concurrent_renders ?? 1);
                    setGpuDevice(h.device?.replace(/_/g, ' ')?.toUpperCase() || "RTX LOCAL");
                }
            } catch (err) {
                console.warn("GPU health fetch failed", err);
            }
        };
        fetchHealth();
        const interval = setInterval(fetchHealth, 3000);
        return () => {
            isSubscribed = false;
            clearInterval(interval);
        };
    }, []);

    const METRICS = [
        {
            label: 'SYS_CALLS_TODAY',
            value: 1284,
            change: +12.4,
            sparkline: [820, 940, 1100, 1050, 1200, 1150, 1284],
        },
        {
            label: 'GPU_ACTIVE_RENDERS',
            value: activeRenders,
            change: 0,
            suffix: ` / ${maxRenders}`,
            sparkline: [0, 0, 0, 0, 0, 0, activeRenders], // simplified sparkline for live val
        },
        {
            label: 'CONVERSION_YIELD',
            value: 23.7,
            decimals: 1,
            suffix: '%',
            change: +2.1,
            sparkline: [18, 19.5, 20.2, 21, 22.5, 23, 23.7],
        },
        {
            label: 'TOLERANCE_VIOLATIONS',
            value: 14,
            change: -8.3,
            sparkline: [28, 24, 22, 19, 18, 16, 14],
            alert: true,
        },
    ];

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="min-h-screen bg-[var(--background)] text-white p-6 font-mono selection:bg-white selection:text-black">

            {/* Header */}
            <motion.div variants={itemVariants} className="mb-12 border-b border-[var(--border-subtle)] pb-6 flex justify-between items-end mt-4">
                <div>
                    <h1 className="text-sm tracking-cinematic text-white uppercase font-sans mb-2">MAISON LUXE // TELEMETRY TERMINAL</h1>
                    <p className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">CONNECTION: SECURE. LATENCY: 12MS.</p>
                </div>
                <div className="text-right">
                    <div className="w-2 h-2 bg-white animate-pulse inline-block mb-3" />
                    <div className="text-[10px] tracking-widest text-[var(--text-secondary)] uppercase">LIVE SESSION</div>
                </div>
            </motion.div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {METRICS.map((m) => {
                    const isPositive = m.change > 0;
                    const isLower = m.label === 'TOLERANCE_VIOLATIONS';
                    const trendGood = isLower ? !isPositive : isPositive;

                    return (
                        <motion.div
                            key={m.label}
                            variants={itemVariants}
                            className="border border-[var(--border-default)] p-5 bg-[var(--surface-primary)] hover:border-white transition-colors duration-500"
                        >
                            <div className="flex items-start justify-between mb-6">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">{m.label}</span>
                                <Sparkline data={m.sparkline} color={m.alert ? "var(--text-dim)" : "white"} />
                            </div>

                            <div className="text-4xl font-light tracking-tighter text-white mb-4">
                                <AnimCounter target={m.value} decimals={m.decimals || 0} />
                                <span className="text-2xl text-[var(--text-muted)]">{m.suffix || ''}</span>
                            </div>

                            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                                <span className="text-[10px] uppercase text-[var(--text-dim)] tracking-widest">{m.label === 'GPU_ACTIVE_RENDERS' ? gpuDevice : 'DELTA (24H)'}</span>
                                <span className={`text-[10px] uppercase font-mono tracking-widest ${trendGood ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                                    {m.label === 'GPU_ACTIVE_RENDERS' ? 'LIVE' : `${isPositive ? '+' : ''}${m.change}%`}
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Quick Actions + Size Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                {/* Actions */}
                <motion.div variants={itemVariants} className="border border-[var(--border-default)] p-6 bg-[var(--surface-primary)] flex flex-col justify-between">
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-6 border-b border-[var(--border-subtle)] pb-2 flex justify-between">
                            <span>Execute Commands</span>
                            <span>[CMD]</span>
                        </h3>
                        <div className="space-y-4">
                            {[
                                { label: 'UPLOAD_ASSET_BATCH', href: '/admin/garments/upload' },
                                { label: 'MODIFY_TOLERANCES', href: '/admin/size-charts' },
                                { label: 'EXTRACT_REPORT_CSV', href: '/admin/analytics' },
                            ].map((a) => (
                                <Link
                                    key={a.label}
                                    href={a.href}
                                    className="block w-full py-3 text-[10px] uppercase font-mono tracking-cinematic text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-white hover:text-black hover:border-white transition-all text-center"
                                >
                                    {a.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Size Distribution */}
                <motion.div variants={itemVariants} className="border border-[var(--border-default)] p-6 bg-[var(--surface-primary)] lg:col-span-2">
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-8 border-b border-[var(--border-subtle)] pb-2 flex justify-between">
                        <span>Distribution Matrix (30D)</span>
                        <span>[IT SIZES]</span>
                    </h3>
                    <div className="flex items-end justify-between gap-2 h-40 mt-4 px-4">
                        {SIZE_DIST.map((s) => (
                            <div key={s.label} className="flex-1 flex flex-col items-center gap-3">
                                <span className="text-[10px] font-mono text-[var(--text-muted)]">{s.pct}%</span>
                                <motion.div
                                    className="w-full max-w-[40px] bg-[var(--border-default)]"
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(s.pct / 35) * 100}%` }}
                                    transition={{ duration: 1, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                                >
                                    {s.label === '48' && <div className="w-full h-full bg-white opacity-80" />}
                                </motion.div>
                                <span className={`text-[10px] uppercase font-mono ${s.label === '48' ? 'text-white border-b border-white' : 'text-[var(--text-secondary)]'}`}>
                                    {s.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Terminal Activity Log */}
            <motion.div variants={itemVariants} className="border border-[var(--border-default)] p-6 bg-[var(--surface-primary)]">
                <div className="flex items-center justify-between mb-6 border-b border-[var(--border-subtle)] pb-2">
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                        System Event Log
                    </h3>
                    <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] animate-pulse">RECORDING...</span>
                </div>

                <div className="space-y-0">
                    {RECENT_ACTIVITY.map((a, i) => (
                        <motion.div
                            key={i}
                            className="flex items-start gap-6 py-4 border-b border-[var(--border-subtle)] last:border-0 hover:bg-white/[0.02] transition-colors"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.8 + i * 0.1 }}
                        >
                            <span className="text-[10px] font-mono text-[var(--text-dim)] w-16 pt-0.5">{a.time}</span>
                            <div className="flex-1 min-w-0">
                                <p className={`text-[10px] uppercase font-mono tracking-widest mb-1 ${a.warning ? 'text-[var(--text-secondary)]' : 'text-white'}`}>
                                    {a.warning ? '[WARN]' : '[INFO]'} {a.event}
                                </p>
                                <p className="text-[10px] font-mono text-[var(--text-muted)]">{a.detail}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

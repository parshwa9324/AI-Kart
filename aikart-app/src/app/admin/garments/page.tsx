'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';
import { Search, Filter, Grid3x3, List, Upload, Eye, Ruler, MoreHorizontal } from 'lucide-react';

/* ── Mock Garment Data ─────────────────────────────────────── */
const GARMENTS = [
    { id: 'G001', name: 'Tailored Wool Blazer', type: 'blazer', material: 'wool', sizes: ['S', 'M', 'L', 'XL'], status: 'active', uploadDate: '2026-02-28', tryOns: 342, color: '#2c2c2c' },
    { id: 'G002', name: 'Cashmere V-Neck Sweater', type: 'sweater', material: 'cashmere', sizes: ['S', 'M', 'L'], status: 'active', uploadDate: '2026-02-25', tryOns: 218, color: '#8B4513' },
    { id: 'G003', name: 'Slim Fit Cotton Shirt', type: 'shirt', material: 'cotton_blend', sizes: ['S', 'M', 'L', 'XL', 'XXL'], status: 'active', uploadDate: '2026-02-20', tryOns: 567, color: '#f5f5f5' },
    { id: 'G004', name: 'Stretch Denim Jeans', type: 'jeans', material: 'stretch_denim', sizes: ['28', '30', '32', '34', '36'], status: 'active', uploadDate: '2026-02-18', tryOns: 489, color: '#1a3a5c' },
    { id: 'G005', name: 'Silk Evening Dress', type: 'dress', material: 'silk', sizes: ['XS', 'S', 'M', 'L'], status: 'draft', uploadDate: '2026-03-01', tryOns: 0, color: '#8b0000' },
    { id: 'G006', name: 'Leather Moto Jacket', type: 'jacket', material: 'leather', sizes: ['S', 'M', 'L'], status: 'active', uploadDate: '2026-02-15', tryOns: 156, color: '#1a1a1a' },
    { id: 'G007', name: 'Linen Summer Shirt', type: 'shirt', material: 'linen', sizes: ['M', 'L', 'XL'], status: 'active', uploadDate: '2026-02-10', tryOns: 298, color: '#d4c5a0' },
    { id: 'G008', name: 'Jersey Polo Shirt', type: 't_shirt', material: 'jersey', sizes: ['S', 'M', 'L', 'XL'], status: 'active', uploadDate: '2026-02-08', tryOns: 412, color: '#14532d' },
];

const TYPES = ['All', 'shirt', 'blazer', 'sweater', 'jeans', 'dress', 'jacket', 't_shirt'];

const container = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const item = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function GarmentCatalog() {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [typeFilter, setTypeFilter] = useState('All');
    const [search, setSearch] = useState('');

    const filtered = GARMENTS.filter(g => {
        if (typeFilter !== 'All' && g.type !== typeFilter) return false;
        if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <motion.div variants={container} initial="hidden" animate="visible">
            {/* Header */}
            <motion.div variants={item} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Garment Catalog</h1>
                    <p className="text-sm text-[var(--text-muted)]">{GARMENTS.length} garments digitized • {GARMENTS.filter(g => g.status === 'active').length} active</p>
                </div>
                <Link
                    href="/admin/garments/upload"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                     bg-gradient-to-r from-[var(--gold-500)] to-[var(--gold-600)] text-black
                     hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                    <Upload className="w-4 h-4" /> Upload Garment
                </Link>
            </motion.div>

            {/* Filter Bar */}
            <motion.div variants={item} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-6">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
                    <input
                        type="text"
                        placeholder="Search garments..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-[var(--surface-glass)] border border-[var(--border-subtle)]
                       text-white placeholder:text-[var(--text-dim)] outline-none
                       focus:border-[var(--border-gold)] transition-colors"
                    />
                </div>

                {/* Type Filter */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <Filter className="w-4 h-4 text-[var(--text-dim)] flex-shrink-0 mr-1" />
                    {TYPES.map(t => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${typeFilter === t
                                ? 'bg-[var(--gold-500)]/15 text-[var(--gold-400)] border border-[var(--border-gold)]'
                                : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface-glass-hover)] border border-transparent'
                                }`}
                        >
                            {t === 'All' ? 'All' : t.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-glass)] border border-[var(--border-subtle)]">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-[var(--text-dim)]'}`}
                    >
                        <Grid3x3 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-[var(--text-dim)]'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>

            {/* Grid View */}
            {viewMode === 'grid' ? (
                <motion.div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4" variants={container}>
                    {filtered.map((g) => (
                        <motion.div
                            key={g.id}
                            variants={item}
                            className="glass rounded-2xl overflow-hidden hover-lift group cursor-pointer"
                        >
                            {/* Color Preview */}
                            <div className="h-36 relative" style={{ background: g.color }}>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                <div className="absolute top-3 right-3">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${g.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                                        }`}>
                                        {g.status}
                                    </span>
                                </div>
                                <div className="absolute bottom-3 left-3 right-3">
                                    <h3 className="text-sm font-semibold text-white truncate">{g.name}</h3>
                                    <p className="text-[10px] text-white/60 uppercase tracking-widest">{g.type} • {g.material.replace('_', ' ')}</p>
                                </div>
                            </div>

                            {/* Details */}
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex gap-1">
                                        {g.sizes.map(s => (
                                            <span key={s} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-dim)]">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                    <button className="p-1 rounded hover:bg-white/5 transition-colors">
                                        <MoreHorizontal className="w-4 h-4 text-[var(--text-dim)]" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[var(--text-muted)] flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> {g.tryOns} try-ons
                                    </span>
                                    <span className="text-[var(--text-dim)]">{g.uploadDate}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                /* List View */
                <motion.div className="glass rounded-2xl overflow-hidden" variants={container}>
                    <div className="grid grid-cols-[1fr_100px_100px_80px_80px_40px] gap-4 px-5 py-3 border-b border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)]">
                        <span>Garment</span><span>Material</span><span>Sizes</span><span>Try-Ons</span><span>Status</span><span></span>
                    </div>
                    {filtered.map((g) => (
                        <motion.div
                            key={g.id}
                            variants={item}
                            className="grid grid-cols-[1fr_100px_100px_80px_80px_40px] gap-4 items-center px-5 py-3.5
                         hover:bg-[var(--surface-glass-hover)] transition-colors border-b border-[var(--border-subtle)] last:border-0 cursor-pointer"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: g.color }} />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{g.name}</p>
                                    <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-widest">{g.type}</p>
                                </div>
                            </div>
                            <span className="text-xs text-[var(--text-secondary)]">{g.material.replace('_', ' ')}</span>
                            <span className="text-xs text-[var(--text-muted)]">{g.sizes.length} sizes</span>
                            <span className="text-xs text-[var(--text-secondary)] tabular-nums">{g.tryOns}</span>
                            <span className={`text-[10px] font-bold uppercase ${g.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {g.status}
                            </span>
                            <button className="p-1 rounded hover:bg-white/5">
                                <MoreHorizontal className="w-4 h-4 text-[var(--text-dim)]" />
                            </button>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </motion.div>
    );
}

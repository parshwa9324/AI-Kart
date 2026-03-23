"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Shirt, Settings, LogOut, UploadCloud, BarChart3, Ruler, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Garment Catalog', href: '/admin/garments', icon: Shirt },
    { name: 'Upload Garment', href: '/admin/garments/upload', icon: UploadCloud },
    { name: 'Size Charts', href: '/admin/size-charts', icon: Ruler },
    { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    { name: 'Settings', href: '/admin/settings', icon: Settings, disabled: true },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
            {/* Ambient Background Glow for Admin */}
            <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#1A1A1A] blur-[150px] pointer-events-none opacity-50" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#0A0F0D] blur-[150px] pointer-events-none opacity-50" />

            {/* Sidebar Navigation */}
            <nav className="w-72 border-r border-white/5 bg-black/60 p-6 flex flex-col justify-between hidden md:flex backdrop-blur-3xl z-20 relative shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                <div>
                    {/* Brand Identity Mock - Ultra Luxury */}
                    <div className="flex items-center gap-4 mb-12 px-2 group cursor-pointer">
                        <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#8A6F1C] flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.2)] overflow-hidden">
                            <motion.div
                                className="absolute inset-0 bg-white/20"
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                            />
                            <span className="text-black font-serif text-2xl drop-shadow-md">M</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-serif tracking-tight text-white group-hover:text-[#D4AF37] transition-colors leading-tight drop-shadow-md">Maison Luxe</h2>
                            <p className="text-[9px] uppercase font-bold tracking-[0.2em] text-zinc-500">Enterprise Node</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-6 px-2 flex flex-col gap-1">
                            System Navigation
                            <div className="h-px w-8 bg-white/10" />
                        </div>

                        {NAV_ITEMS.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;

                            return item.disabled ? (
                                <div key={item.name} className="flex items-center gap-3 px-3 py-3 rounded-lg text-zinc-700 cursor-not-allowed">
                                    <Icon className="w-4 h-4" />
                                    <span className="text-sm font-medium tracking-wide">{item.name}</span>
                                    <span className="ml-auto text-[8px] uppercase tracking-widest border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 bg-zinc-900/50">Locked</span>
                                </div>
                            ) : (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all group relative",
                                        isActive
                                            ? "text-[#D4AF37] bg-[#D4AF37]/10"
                                            : "text-zinc-400 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebarIndicator"
                                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#D4AF37] rounded-r-full shadow-[0_0_10px_#D4AF37]"
                                        />
                                    )}
                                    <Icon className={cn("w-4 h-4 transition-transform", isActive ? "scale-110 drop-shadow-[0_0_5px_#D4AF37]" : "group-hover:scale-110 group-hover:text-white")} />
                                    <span className="tracking-wide">{item.name}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="mx-2 p-4 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 backdrop-blur-md relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-[#D4AF37]/5 to-transparent pointer-events-none" />
                        <div className="flex items-start gap-3 relative z-10">
                            <Zap className="w-4 h-4 text-[#D4AF37] mt-0.5 animate-pulse" />
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] mb-0.5">Premium Tier</h4>
                                <p className="text-[10px] text-zinc-400 leading-relaxed font-medium">92.4% GPU quota utilized. Auto-scale enabled.</p>
                            </div>
                        </div>
                    </div>

                    <button className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-500/10 transition-colors w-full group">
                        <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="tracking-wide">Terminate Session</span>
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative z-10 custom-scrollbar">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
                <div className="relative z-10 h-full p-8 lg:p-12">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, scale: 0.98, filter: 'blur(5px)' }}
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 1.02, filter: 'blur(5px)' }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}


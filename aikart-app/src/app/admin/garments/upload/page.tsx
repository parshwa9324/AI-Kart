"use client";

import { useState, useRef } from "react";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { UploadCloud, CheckCircle2, ChevronRight, Activity, Cpu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AIKartAPI } from "@/ar-engine/APIClient";
import { DEFAULT_MATERIALS } from "@/types/types";
import type { GarmentMeasurements } from "@/types/types";

export default function GarmentUploadPage() {
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [measurements, setMeasurements] = useState<GarmentMeasurements | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setFileUrl(url);
        }
    };

    const handleSimulateAI = async () => {
        if (!fileUrl) {
            alert("Please upload a Garment photo first.");
            return;
        }

        setIsProcessing(true);
        try {
            // Send the raw data URL to the FastAPI Python server
            const result = await AIKartAPI.uploadGarment({
                photo: fileUrl,
                metadata: {
                    brandId: "maison_luxe_01",
                    name: "Digitized SKU",
                    category: "tshirt",
                    sizeLabel: "M",
                    material: DEFAULT_MATERIALS.cotton
                }
            });

            setMeasurements(result.measurements);
            setStep(2);
        } catch (error) {
            console.error(error);
            alert("Computer Vision Extraction Failed. Please check the backend console.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 relative z-10">
            <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between border-b border-white/5 pb-6 mt-4 gap-4">
                <div>
                    <h1 className="text-4xl font-serif tracking-tight text-[#D4AF37] mb-2 drop-shadow-md">Garment Digitization Pipeline</h1>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Autonomous Spatial Extraction</p>
                </div>
            </header>

            {/* Stepper */}
            <div className="flex items-center gap-4 mb-8">
                <StepIndicator active={step >= 1} number={1} label="Upload Scan" />
                <div className={`h-px flex-1 ${step >= 2 ? 'bg-[#D4AF37]' : 'bg-white/10'}`} />
                <StepIndicator active={step >= 2} number={2} label="AI Processing" />
                <div className={`h-px flex-1 ${step >= 3 ? 'bg-[#D4AF37]' : 'bg-white/10'}`} />
                <StepIndicator active={step >= 3} number={3} label="Quality Assurance" />
            </div>

            <PremiumCard className="p-8 bg-zinc-950/80">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center p-16 border border-dashed border-[#D4AF37]/30 rounded-2xl bg-[#D4AF37]/[0.02] relative overflow-hidden group hover:border-[#D4AF37]/50 transition-colors"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div
                                className="w-20 h-20 bg-black/50 border border-white/5 rounded-full flex items-center justify-center mb-6 shadow-xl relative z-10 group-hover:scale-110 transition-transform cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <UploadCloud className="w-8 h-8 text-[#D4AF37]" />
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                />
                            </div>

                            <h3 className="text-xl font-serif text-white mb-2 relative z-10">
                                {fileUrl ? "Garment Loaded" : "Drop Garment Photo"}
                            </h3>
                            <p className="text-xs font-medium text-zinc-500 mb-8 max-w-sm text-center relative z-10 leading-relaxed">
                                Ensure the Maison Luxe Target Anchor is visible in the frame for millimeter-perfect spatial analysis.
                            </p>

                            {fileUrl && (
                                <img src={fileUrl} alt="Preview" className="w-32 h-32 object-cover rounded-xl border border-white/10 mb-6 relative z-10 shadow-lg opacity-80" />
                            )}

                            <div className="relative z-10">
                                <AnimatedButton onClick={handleSimulateAI} isLoading={isProcessing} className="bg-[#D4AF37] text-black hover:bg-[#F9F1A5] border-none px-8 font-bold tracking-wide">
                                    {isProcessing ? "Executing CV Engine..." : "Initialize Scanner"}
                                </AnimatedButton>
                            </div>

                            {isProcessing && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="mt-8 flex items-center gap-3 text-xs tracking-widest uppercase font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-6 py-3 rounded-full border border-[#D4AF37]/20 shadow-[0_0_15px_rgba(212,175,55,0.15)] relative z-10"
                                >
                                    <Cpu className="w-4 h-4 animate-pulse" /> Executing Neural Network
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-10"
                        >
                            {/* Left: Simulated AI result */}
                            <div className="aspect-[3/4] bg-black/60 rounded-2xl relative overflow-hidden border border-white/10 flex items-center justify-center shadow-inner group">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.1)_0%,transparent_70%)] opacity-50" />
                                <div className="absolute inset-0 bg-[linear-gradient(to_right,#D4AF3720_1px,transparent_1px),linear-gradient(to_bottom,#D4AF3720_1px,transparent_1px)] bg-[size:32px_32px] opacity-20 pointer-events-none" />
                                <div className="text-center relative z-10">
                                    <Activity className="w-12 h-12 text-emerald-400 mx-auto mb-4 drop-shadow-[0_0_8px_#10b981]" />
                                    <p className="text-emerald-400 font-bold tracking-widest uppercase text-xs">Vector Data Extracted</p>
                                    <p className="text-[10px] text-emerald-500/70 font-mono mt-2">Vertices computed: 4,096</p>
                                </div>
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-b from-transparent via-[#D4AF37]/20 to-transparent w-full h-[5px]"
                                    animate={{ y: ['-100%', '800%'] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                />
                            </div>

                            {/* Right: Extracted Metrics Form */}
                            <div className="space-y-8 flex flex-col justify-center">
                                <div className="border-b border-white/5 pb-4">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37] mb-1">Spatial Measurements</h3>
                                    <p className="text-xs text-zinc-500">Review generated topology before committing to the Digital Vault.</p>
                                </div>

                                <div className="space-y-5">
                                    <MockInput label="Chest Breadth / Circ." value={measurements?.chestWidth ? `${measurements.chestWidth.toFixed(1)} cm` : "N/A"} verified />
                                    <MockInput label="Shoulder Width (Acromion)" value={measurements?.shoulderWidth ? `${measurements.shoulderWidth.toFixed(1)} cm` : "N/A"} verified />
                                    <MockInput label="Center Back Length" value={measurements?.garmentLength ? `${measurements.garmentLength.toFixed(1)} cm` : "N/A"} verified />

                                    <div className="pt-6 border-t border-white/5 space-y-4">
                                        <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-[0.2em] mb-2">Material Physics Override</p>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="space-y-1.5 flex flex-col">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Tensile Factor</label>
                                                <select className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 appearance-none font-medium">
                                                    <option>Low Elasticity (0-5%)</option>
                                                    <option>Nominal Elasticity (5-15%)</option>
                                                    <option>High Elasticity (&gt;15%)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <AnimatedButton className="w-full mt-6 bg-white text-black hover:bg-neutral-200" onClick={() => setStep(3)}>
                                    Mint to Digital Catalog <ChevronRight className="w-4 h-4 ml-1" />
                                </AnimatedButton>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center py-20 text-center"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                className="w-24 h-24 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-8 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                            >
                                <CheckCircle2 className="w-12 h-12" />
                            </motion.div>
                            <h3 className="text-3xl font-serif text-white mb-3 drop-shadow-md">Digitization Perfected</h3>
                            <p className="text-sm text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed">
                                The garment's spatial topology has been successfully committed to the Maison Luxe Enterprise Engine.
                            </p>
                            <AnimatedButton onClick={() => setStep(1)} className="bg-[#D4AF37] text-black hover:bg-[#F9F1A5] px-8 font-bold tracking-wider uppercase text-xs">
                                Process Next SKU
                            </AnimatedButton>
                        </motion.div>
                    )}
                </AnimatePresence>
            </PremiumCard>
        </div>
    );
}

function StepIndicator({ active, number, label }: { active: boolean, number: number, label: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500",
                active
                    ? "bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.4)]"
                    : "bg-black text-zinc-600 border border-white/10"
            )}>
                {number}
            </div>
            <span className={cn(
                "font-bold text-[10px] uppercase tracking-widest hidden sm:block transition-colors duration-500",
                active ? "text-[#D4AF37]" : "text-zinc-600"
            )}>{label}</span>
        </div>
    );
}

function MockInput({ label, value, verified = false }: { label: string, value: string, verified?: boolean }) {
    return (
        <div className="space-y-1.5 flex flex-col relative group">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-[#D4AF37] transition-colors">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    defaultValue={value}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-colors"
                />
                {verified && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Calibrated</span>
                    </div>
                )}
            </div>
        </div>
    );
}

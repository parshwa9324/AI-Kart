'use client';

/**
 * BodyCalibrationModal.tsx — Body Measurement Input (B2B SaaS Premium UI)
 *
 * A sophisticated, animated onboarding flow for users to enter their measurements.
 * Replaces the old basic modal with a glassmorphic Framer Motion experience.
 */

import { useState, useEffect, useCallback } from 'react';
import { usePoseStore } from '../../store/PoseStore';
import type { UserBodyProfile, UserBodyMeasurements } from '../../types/types';
import { motion, AnimatePresence } from 'framer-motion';
import { PremiumCard } from './PremiumCard';
import { AnimatedButton } from './AnimatedButton';
import { Ruler, Sparkles, X, ChevronRight, Check, Camera } from 'lucide-react';
import SpatialScanner from './SpatialScanner';
import type { ExtractedMeasurements } from '@/ar-engine/CentimeterConversionEngine';
import { cn } from '@/lib/utils';
import { usePhysicalTwin } from '../../hooks/usePhysicalTwin';

const STORAGE_KEY = 'aikart_body_profile';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

/** Anthropometric ratios relative to height (cm). Based on ergonomic research. */
function estimateFromHeight(heightCm: number): UserBodyMeasurements {
    return {
        chestCircumference: Math.round(heightCm * 0.54),
        waistCircumference: Math.round(heightCm * 0.44),
        hipCircumference: Math.round(heightCm * 0.56),
        shoulderWidth: Math.round(heightCm * 0.25),
        armLength: Math.round(heightCm * 0.34),
        torsoLength: Math.round(heightCm * 0.30),
        inseam: Math.round(heightCm * 0.45),
    };
}

export default function BodyCalibrationModal({ isOpen, onClose }: Props) {
    const setBodyProfile = usePoseStore(s => s.setBodyProfile);
    const { saveProfile: persistToBackend, sessionToken } = usePhysicalTwin();

    const [height, setHeight] = useState(175);
    const [chest, setChest] = useState(96);
    const [waist, setWaist] = useState(82);
    const [hip, setHip] = useState(98);
    const [shoulder, setShoulder] = useState(44);
    const [armLength, setArmLength] = useState(60);
    const [hasEstimated, setHasEstimated] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // UI steps: 0 = Height, 1 = Detailed Measurements
    const [step, setStep] = useState(0);

    // Load from localStorage on mount — always start at Step 0
    useEffect(() => {
        if (!isOpen) return;
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const profile: UserBodyProfile = JSON.parse(stored);
                setHeight(profile.heightCm);
                setChest(profile.measurements.chestCircumference);
                setWaist(profile.measurements.waistCircumference);
                setHip(profile.measurements.hipCircumference);
                setShoulder(profile.measurements.shoulderWidth);
                setArmLength(profile.measurements.armLength);
            }
        } catch { /* silent */ }
        // Always start at Step 0 so the user sees the full flow
        setStep(0);
        setHasEstimated(false);
    }, [isOpen]);

    const handleEstimate = useCallback(() => {
        const est = estimateFromHeight(height);
        setChest(est.chestCircumference);
        setWaist(est.waistCircumference);
        setHip(est.hipCircumference);
        setShoulder(est.shoulderWidth);
        setArmLength(est.armLength);
        setHasEstimated(true);
        setStep(1);
    }, [height]);

    const handleScanComplete = useCallback((data: any) => {
        setShowScanner(false);
        setHeight(data.heightCm);
        setChest(data.measurements.chestCircumference.value);
        setWaist(data.measurements.waistCircumference.value);
        setHip(data.measurements.hipCircumference.value);
        setShoulder(data.measurements.shoulderWidth.value);
        setArmLength(data.measurements.armLength.value);
        setHasEstimated(false); // They were literally measured, not estimated by height!
        setStep(1);
    }, []);

    const handleSave = useCallback(() => {
        const profile: UserBodyProfile = {
            userId: sessionToken || `local_${Date.now()}`,
            heightCm: height,
            measurements: {
                chestCircumference: chest,
                waistCircumference: waist,
                hipCircumference: hip,
                shoulderWidth: shoulder,
                armLength: armLength,
                torsoLength: Math.round(height * 0.30),
                inseam: Math.round(height * 0.45),
            },
            scanMethod: hasEstimated ? 'mediapipe_estimated' : 'manual_input',
            measuredAt: new Date().toISOString(),
            confidence: hasEstimated ? 0.65 : 0.7,
        };

        // 1. Store in Zustand (volatile — for immediate UI use)
        setBodyProfile(profile);
        // 2. Store in localStorage (client-side backup)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* silent */ }
        // 3. Persist to backend SQLite (the permanent Physical Twin)
        persistToBackend(profile).catch((err: unknown) =>
            console.warn('[BodyCalibration] Backend persist failed:', err)
        );
        onClose();
    }, [height, chest, waist, hip, shoulder, armLength, hasEstimated, setBodyProfile, onClose, persistToBackend, sessionToken]);

    function cmToFeetInches(cm: number): string {
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        return `${feet}'${inches}"`;
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Scanner Overlay */}
                    <SpatialScanner
                        isOpen={showScanner}
                        onClose={() => setShowScanner(false)}
                        onComplete={handleScanComplete}
                    />

                    {/* Modal Container */}
                    <PremiumCard
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="w-full max-w-lg shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/5 rounded-full text-neutral-300">
                                    <Ruler className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-medium text-white tracking-tight">Digital Profile</h2>
                                    <p className="text-xs text-neutral-400">Step {step + 1} of 2</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="p-6">
                            <AnimatePresence mode="wait">
                                {step === 0 ? (
                                    <motion.div
                                        key="step-0"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-8"
                                    >
                                        <div className="text-center space-y-2">
                                            <h3 className="text-2xl font-semibold text-white">How tall are you?</h3>
                                            <p className="text-neutral-400 text-sm">We use this to estimate your initial dimensions.</p>
                                        </div>

                                        <div className="py-8 text-center space-y-6">
                                            <div className="flex items-end justify-center gap-2">
                                                <span className="text-6xl font-light text-white tracking-tighter">{height}</span>
                                                <span className="text-xl text-neutral-500 mb-2 font-medium">cm</span>
                                                <span className="text-md text-neutral-600 mb-2 ml-2">({cmToFeetInches(height)})</span>
                                            </div>

                                            <div className="relative px-4">
                                                <input
                                                    type="range"
                                                    min={140}
                                                    max={210}
                                                    step={1}
                                                    value={height}
                                                    onChange={e => setHeight(Number(e.target.value))}
                                                    className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <AnimatedButton onClick={() => setShowScanner(true)} className="w-full py-4 text-base group bg-emerald-600 hover:bg-emerald-500 text-black font-bold">
                                                <Camera className="w-5 h-5 mr-2" />
                                                Spatial Body Scan (Recommended)
                                            </AnimatedButton>

                                            <div className="relative flex py-4 items-center">
                                                <div className="flex-grow border-t border-white/10"></div>
                                                <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs text-uppercase tracking-widest font-bold">Or Manual Entry</span>
                                                <div className="flex-grow border-t border-white/10"></div>
                                            </div>

                                            <div className="flex gap-2">
                                                <AnimatedButton variant="secondary" onClick={handleEstimate} className="flex-1 text-sm bg-white/5 hover:bg-white/10">
                                                    <Sparkles className="w-4 h-4 mr-2 text-yellow-500" /> Auto-Estimate
                                                </AnimatedButton>
                                                <button
                                                    onClick={() => setStep(1)}
                                                    className="flex-1 text-sm font-medium text-neutral-400 hover:text-white transition-colors border border-white/10 rounded-xl"
                                                >
                                                    Type manually
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="step-1"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="space-y-6"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xl font-medium text-white">Refine Details</h3>
                                            {hasEstimated && (
                                                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20">
                                                    AI Estimated
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <MeasurementInput label="Chest" value={chest} onChange={setChest} />
                                            <MeasurementInput label="Waist" value={waist} onChange={setWaist} />
                                            <MeasurementInput label="Hips" value={hip} onChange={setHip} />
                                            <MeasurementInput label="Shoulder" value={shoulder} onChange={setShoulder} />
                                            <div className="col-span-2">
                                                <MeasurementInput label="Arm Length" value={armLength} onChange={setArmLength} />
                                            </div>
                                        </div>

                                        <div className="pt-4 flex gap-3">
                                            <AnimatedButton variant="outline" onClick={() => setStep(0)} className="flex-1">
                                                Back
                                            </AnimatedButton>
                                            <AnimatedButton onClick={handleSave} className="flex-[2]">
                                                <Check className="w-4 h-4 mr-2" />
                                                Save Profile
                                            </AnimatedButton>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </PremiumCard>
                </div>
            )}
        </AnimatePresence>
    );
}

function MeasurementInput({
    label, value, onChange
}: {
    label: string; value: number; onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-1.5 flex flex-col">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider pl-1">
                {label}
            </label>
            <div className="relative">
                <input
                    type="number"
                    min={20}
                    max={200}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="w-full bg-neutral-900/50 border border-white/5 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-center"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-bold pointer-events-none">
                    CM
                </span>
            </div>
        </div>
    );
}

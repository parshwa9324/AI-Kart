'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PoseDetector, LANDMARK, type PoseResult } from '@/ar-engine/PoseDetector';
import { CentimeterConversionEngine, type ExtractedMeasurements } from '@/ar-engine/CentimeterConversionEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Camera, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { AnimatedButton } from './AnimatedButton';
import { PremiumCard } from './PremiumCard';
import { cn } from '@/lib/utils';

type ScannerState = 'init' | 'anchor_calibration' | 'aligning' | 'frontal_capture' | 'turn_left_lateral' | 'left_lateral_capture' | 'turn_right_lateral' | 'right_lateral_capture' | 'success' | 'error';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (measurements: ExtractedMeasurements) => void;
}

export default function SpatialScanner({ isOpen, onClose, onComplete }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const detectorRef = useRef<PoseDetector | null>(null);
    const reqRef = useRef<number>(0);

    const [state, setState] = useState<ScannerState>('init');
    const [instruction, setInstruction] = useState('Initializing Camera Systems...');
    const [alignmentScore, setAlignmentScore] = useState(0);
    const [absoluteScaleMultiplier, setAbsoluteScaleMultiplier] = useState(1);
    const [progress, setProgress] = useState(0);
    const [latestLandmarks, setLatestLandmarks] = useState<any[]>([]);

    const [frontalImage, setFrontalImage] = useState<string | null>(null);
    const [leftLateralImage, setLeftLateralImage] = useState<string | null>(null);
    const [rightLateralImage, setRightLateralImage] = useState<string | null>(null);
    const [finalMeasurements, setFinalMeasurements] = useState<ExtractedMeasurements | null>(null);

    // Stored landmarks
    const frontalData = useRef<PoseResult | null>(null);
    const leftLateralData = useRef<PoseResult | null>(null);
    const rightLateralData = useRef<PoseResult | null>(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();

                // Init detector
                const detector = new PoseDetector();
                await detector.init();
                detectorRef.current = detector;

                setState('anchor_calibration');
                setInstruction('Calibration: Hold a Credit Card by its edges between your index fingers.');
                loop();
            }
        } catch (e) {
            setState('error');
            setInstruction('Camera access denied or unavailable.');
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        if (detectorRef.current) {
            detectorRef.current.dispose();
            detectorRef.current = null;
        }
        cancelAnimationFrame(reqRef.current);
    };

    useEffect(() => {
        if (isOpen) {
            setState('init');
            setProgress(0);
            setAlignmentScore(0);
            frontalData.current = null;
            leftLateralData.current = null;
            rightLateralData.current = null;
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen]);

    const loop = useCallback(() => {
        if (!videoRef.current || !detectorRef.current) return;

        const timestamp = performance.now();
        const result = detectorRef.current.detect(videoRef.current, timestamp);

        setState(currentState => {
            if (currentState === 'success' || currentState === 'error') return currentState;

            if (!result) {
                setInstruction('Searching for subject...');
                setLatestLandmarks([]);
                return currentState;
            }

            const lms = result.landmarks;
            setLatestLandmarks(lms);

            // 0. Absolute Scale Calibration (Anchor Phase)
            if (currentState === 'anchor_calibration') {
                const worldLms = result.worldLandmarks;
                const leftIndexW = worldLms?.[LANDMARK.LEFT_INDEX];
                const rightIndexW = worldLms?.[LANDMARK.RIGHT_INDEX];
                const leftIndex2D = lms[LANDMARK.LEFT_INDEX];
                const rightIndex2D = lms[LANDMARK.RIGHT_INDEX];

                if (leftIndexW && rightIndexW && leftIndex2D?.visibility > 0.5 && rightIndex2D?.visibility > 0.5) {
                    const dx = leftIndexW.x - rightIndexW.x;
                    const dy = leftIndexW.y - rightIndexW.y;
                    const dz = leftIndexW.z - rightIndexW.z;
                    const distanceMeters = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    // Standard Credit Card Width = 8.56cm
                    // Validate they are holding something roughly card-sized
                    if (distanceMeters > 0.04 && distanceMeters < 0.20) {
                        setInstruction('Card edge detected. Hold steady to lock scale...');

                        setProgress(p => {
                            const next = p + (100 / 60); // 2 seconds lock
                            if (next >= 100) {
                                // 8.56 cm / (world distance in cm)
                                const lockedScale = 8.56 / (distanceMeters * 100);
                                setAbsoluteScaleMultiplier(lockedScale);

                                setTimeout(() => {
                                    setState('aligning');
                                    setInstruction('Scale Locked. Now step back until full body matches silhouette.');
                                    setProgress(0);
                                }, 500);
                                return 100;
                            }
                            return next;
                        });
                        return 'anchor_calibration';
                    }
                }
                setInstruction('Calibration: Hold a standard Card horizontally by its edges between your index fingers.');
                setProgress(0);
                return 'anchor_calibration';
            }

            const head = lms[LANDMARK.NOSE];
            const leftAnkle = lms[LANDMARK.LEFT_ANKLE];
            const rightAnkle = lms[LANDMARK.RIGHT_ANKLE];

            // 1. Calculate Real-Time Alignment Telemetry Score
            let score = 0;
            if (head && leftAnkle && rightAnkle && head.visibility > 0.5 && leftAnkle.visibility > 0.5) {
                score += 50; // Base baseline for seeing full body

                // Centrality Penalty
                const centerX = head.x;
                const centerPenalty = Math.abs(0.5 - centerX) * 100; // 0 penalty if perfectly centered at 0.5
                score += Math.max(0, 25 - centerPenalty);

                // Size/Distance Penalty (Ideal vertical height in frame is ~65%)
                const heightInFrame = Math.abs(head.y - leftAnkle.y);
                const sizePenalty = Math.abs(0.65 - heightInFrame) * 100;
                score += Math.max(0, 25 - sizePenalty);
            }
            const finalScore = Math.min(100, Math.max(0, Math.round(score)));
            setAlignmentScore(finalScore);

            const isAligned = finalScore >= 90;

            if (!isAligned) {
                if (currentState === 'aligning' || currentState === 'frontal_capture') {
                    setInstruction(finalScore < 50 ? 'Step back further. Frame head to ankles.' : 'Center yourself in the silhouette.');
                    setProgress(0);
                    return 'aligning';
                } else if (currentState === 'turn_left_lateral' || currentState === 'left_lateral_capture') {
                    setInstruction('Ensure full body is visible and centered.');
                    setProgress(0);
                    return 'turn_left_lateral';
                } else if (currentState === 'turn_right_lateral' || currentState === 'right_lateral_capture') {
                    setInstruction('Ensure full body is visible and centered.');
                    setProgress(0);
                    return 'turn_right_lateral';
                }
            }

            // Capture Frame Helper
            const captureFrame = (setter: (dataUrl: string) => void) => {
                if (videoRef.current) {
                    const canvas = document.createElement('canvas');
                    canvas.width = videoRef.current.videoWidth;
                    canvas.height = videoRef.current.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                        setter(canvas.toDataURL('image/jpeg', 0.8));
                    }
                }
            };

            // 2. Frontal Capture
            if (currentState === 'aligning' || currentState === 'frontal_capture') {
                setInstruction('Stand still. Arms slightly out (A-Pose).');

                setProgress(p => {
                    const next = p + (100 / 60); // approx 2 seconds at 30fps
                    if (next >= 100) {
                        frontalData.current = result;
                        captureFrame(setFrontalImage);

                        setTimeout(() => {
                            setState('turn_left_lateral');
                            setInstruction('Turn 90° Left (Face the right edge of screen).');
                            setProgress(0);
                        }, 500);
                        return 100;
                    }
                    return next;
                });
                return 'frontal_capture';
            }

            // 3. Left Lateral Capture
            if (currentState === 'turn_left_lateral' || currentState === 'left_lateral_capture') {
                const ls = lms[LANDMARK.LEFT_SHOULDER];
                const rs = lms[LANDMARK.RIGHT_SHOULDER];
                const shoulderDistX = Math.abs((ls?.x || 0) - (rs?.x || 0));

                // For a Left Lateral, the left shoulder is pointing at the camera, meaning its Z (depth) is smaller (closer).
                const isFacingLeft = ls && rs && ls.z < rs.z;

                if (!isFacingLeft || shoulderDistX > 0.15) { // Relaxed threshold for side profiles
                    setInstruction('Turn 90° Left (Face the right edge of screen).');
                    setProgress(0);
                    return 'turn_left_lateral';
                }

                setInstruction('Hold left profile...');
                setProgress(p => {
                    const next = p + (100 / 60);
                    if (next >= 100) {
                        leftLateralData.current = result;
                        captureFrame(setLeftLateralImage);

                        setTimeout(() => {
                            setState('turn_right_lateral');
                            setInstruction('Turn 180° Right (Face the opposite direction).');
                            setProgress(0);
                        }, 500);
                        return 100;
                    }
                    return next;
                });
                return 'left_lateral_capture';
            }

            // 4. Right Lateral Capture
            if (currentState === 'turn_right_lateral' || currentState === 'right_lateral_capture') {
                const ls = lms[LANDMARK.LEFT_SHOULDER];
                const rs = lms[LANDMARK.RIGHT_SHOULDER];
                const shoulderDistX = Math.abs((ls?.x || 0) - (rs?.x || 0));

                // For a Right Lateral, the right shoulder is pointing at the camera.
                const isFacingRight = ls && rs && rs.z < ls.z;

                if (!isFacingRight || shoulderDistX > 0.15) {
                    setInstruction('Turn 180° Right (Face the opposite direction).');
                    setProgress(0);
                    return 'turn_right_lateral';
                }

                setInstruction('Hold right profile...');
                setProgress(p => {
                    const next = p + (100 / 60);
                    if (next >= 100) {
                        rightLateralData.current = result;
                        captureFrame(setRightLateralImage);

                        // Delay transition to success to ensure images capture
                        setTimeout(() => processScan(), 100);
                        return 100;
                    }
                    return next;
                });
                return 'right_lateral_capture';
            }

            return currentState;
        });

        reqRef.current = requestAnimationFrame(loop);
    }, []);

    const processScan = async () => {
        if (!frontalData.current?.worldLandmarks || !leftLateralData.current?.worldLandmarks || !rightLateralData.current?.worldLandmarks) {
            setState('error');
            setInstruction('Failed to acquire metric 3D data. Try again.');
            return;
        }

        setState('success'); // show processing state conceptually
        setInstruction('Processing 3D Neural Scan via Maison Luxe Backend...');

        try {
            const token = localStorage.getItem('ai_kart_token'); // basic auth if needed
            const response = await fetch('http://localhost:8000/api/v1/body/scan/landmarks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    frontalScan: frontalData.current.worldLandmarks,
                    leftLateralScan: leftLateralData.current.worldLandmarks,
                    rightLateralScan: rightLateralData.current.worldLandmarks,
                    heightCm: 170, // will be overridden by triangulated height
                    absoluteScaleMultiplier: absoluteScaleMultiplier
                })
            });

            if (!response.ok) {
                throw new Error('Backend computation failed');
            }

            const data = await response.json();
            setFinalMeasurements(data);
            setInstruction('Enterprise Scan Complete. Review captures.');
        } catch (err) {
            console.error(err);
            setState('error');
            setInstruction('Network error during scan processing. Please try again.');
        }
    };

    if (!isOpen) return null;

    const telemetryLines = [
        { label: 'NEURAL', value: alignmentScore > 0 ? `${(alignmentScore * 0.97).toFixed(1)}%` : '---' },
        { label: 'SPATIAL', value: latestLandmarks.length > 0 ? `${latestLandmarks.length} PTS` : '---' },
        { label: 'BIOMETRIC', value: state === 'frontal_capture' || state === 'left_lateral_capture' || state === 'right_lateral_capture' ? 'LOCKING' : 'SCAN' },
    ];

    return (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center font-sans">

            {/* The Raw Camera Feed */}
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-100"
                playsInline muted
            />

            {/* ── HOLOGRAPHIC VIGNETTE ─────────────────────────────── */}
            <div className="absolute inset-0 z-[5] pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)' }}
            />

            {/* ── CORNER BRACKET RETICLES ──────────────────────────── */}
            {(['tl','tr','bl','br'] as const).map(corner => (
                <motion.div
                    key={corner}
                    initial={{ opacity: 0, scale: 1.4 }}
                    animate={{ opacity: 0.9, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}
                    className={cn(
                        'absolute z-10 pointer-events-none',
                        corner === 'tl' && 'top-4 left-4 md:top-8 md:left-8',
                        corner === 'tr' && 'top-4 right-4 md:top-8 md:right-8',
                        corner === 'bl' && 'bottom-16 left-4 md:bottom-20 md:left-8',
                        corner === 'br' && 'bottom-16 right-4 md:bottom-20 md:right-8',
                    )}
                    style={{ width: 36, height: 36 }}
                >
                    <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
                        {corner === 'tl' && <><polyline points="0,18 0,0 18,0" stroke="#10b981" strokeWidth="2" strokeLinecap="round" /></>}
                        {corner === 'tr' && <><polyline points="18,0 36,0 36,18" stroke="#10b981" strokeWidth="2" strokeLinecap="round" /></>}
                        {corner === 'bl' && <><polyline points="0,18 0,36 18,36" stroke="#10b981" strokeWidth="2" strokeLinecap="round" /></>}
                        {corner === 'br' && <><polyline points="18,36 36,36 36,18" stroke="#10b981" strokeWidth="2" strokeLinecap="round" /></>}
                    </svg>
                </motion.div>
            ))}

            {/* ── LIVE TELEMETRY SIDEBAR ────────────────────────────── */}
            {state !== 'success' && state !== 'init' && (
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3 pointer-events-none"
                >
                    {telemetryLines.map(({ label, value }) => (
                        <div key={label} className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-emerald-500/60 uppercase">{label}</span>
                            <span className="text-xs font-mono text-emerald-300 tabular-nums">{value}</span>
                        </div>
                    ))}
                    <div className="mt-2 h-px w-12 bg-emerald-500/20" />
                    <div className="text-[8px] font-mono text-emerald-500/40 uppercase tracking-widest">
                        {state.replace(/_/g, ' ')}
                    </div>
                </motion.div>
            )}

            {/* Real-time Skeleton Overlay */}
            {latestLandmarks.length > 0 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 1 1" preserveAspectRatio="none">
                    {[
                        [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER],
                        [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW],
                        [LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST],
                        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW],
                        [LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
                        [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP],
                        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP],
                        [LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP],
                        [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE],
                        [LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE],
                        [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
                        [LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
                    ].map(([start, end], i) => {
                        const p1 = latestLandmarks[start];
                        const p2 = latestLandmarks[end];
                        if (!p1 || !p2 || p1.visibility < 0.5 || p2.visibility < 0.5) return null;
                        return (
                            <line
                                key={`line-${i}`}
                                x1={1 - p1.x} y1={p1.y}
                                x2={1 - p2.x} y2={p2.y}
                                stroke="rgba(16, 185, 129, 0.7)"
                                strokeWidth="0.004"
                                strokeLinecap="round"
                            />
                        );
                    })}
                    {[
                        LANDMARK.NOSE,
                        LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER,
                        LANDMARK.LEFT_ELBOW, LANDMARK.RIGHT_ELBOW,
                        LANDMARK.LEFT_WRIST, LANDMARK.RIGHT_WRIST,
                        LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP,
                        LANDMARK.LEFT_KNEE, LANDMARK.RIGHT_KNEE,
                        LANDMARK.LEFT_ANKLE, LANDMARK.RIGHT_ANKLE,
                    ].map((idx) => {
                        const p = latestLandmarks[idx];
                        if (!p || p.visibility < 0.5) return null;
                        return (
                            <circle
                                key={`joint-${idx}`}
                                cx={1 - p.x}
                                cy={p.y}
                                r={idx === LANDMARK.NOSE ? '0.009' : '0.005'}
                                fill={idx === LANDMARK.NOSE ? '#34d399' : '#10b981'}
                            />
                        );
                    })}
                </svg>
            )}

            <PremiumCard className="w-full max-w-4xl aspect-[4/3] md:aspect-[16/9] relative overflow-hidden border-0 !bg-transparent !backdrop-blur-none !shadow-none ring-0">

                {/* ── TOP HUD BAR ─────────────────────────────────────── */}
                <div className="absolute inset-x-0 top-0 p-4 md:p-6 bg-gradient-to-b from-black/90 to-transparent flex justify-between items-start z-20">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <motion.div
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1.2, repeat: Infinity }}
                                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                            />
                            <h2 className="text-white text-sm font-bold tracking-[0.15em] uppercase drop-shadow-md">Kinematic Spatial Engine</h2>
                        </div>
                        <p className="text-emerald-300/80 text-xs font-mono mt-0.5 drop-shadow-md">{instruction}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {state !== 'success' && state !== 'error' && (
                            <div className={cn(
                                "px-3 py-1 font-mono font-bold text-xs backdrop-blur-md transition-all duration-500 border",
                                alignmentScore >= 90
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                                    : 'bg-red-950/20 text-rose-400 border-rose-500/30'
                            )}>
                                ALIGN {alignmentScore}%
                            </div>
                        )}
                        <button onClick={onClose} className="p-2.5 bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white backdrop-blur-md transition-all">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>



                {/* Target Silhouettes */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 opacity-60">
                    <AnimatePresence>
                        {(state === 'aligning' || state === 'frontal_capture') && (
                            <motion.svg
                                initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                viewBox="0 0 200 400" className="h-[80%] w-auto max-w-full drop-shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                            >
                                {/* Simple frontal outline */}
                                <path d="M100,20 C115,20 125,35 125,50 C125,65 115,80 100,80 C85,80 75,65 75,50 C75,35 85,20 100,20 Z M65,90 L135,90 C150,90 160,105 160,120 L160,180 C160,195 150,210 135,210 L125,210 L125,360 C125,375 115,385 105,385 C95,385 85,375 85,360 L85,210 L75,210 L75,360 C75,375 65,385 55,385 C45,385 35,375 35,360 L35,210 L25,210 C10,210 0,195 0,180 L0,120 C0,105 10,90 25,90 Z" fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth="2" strokeDasharray="6, 6" />
                            </motion.svg>
                        )}
                        {(state === 'turn_left_lateral' || state === 'left_lateral_capture' || state === 'turn_right_lateral' || state === 'right_lateral_capture') && (
                            <motion.svg
                                initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                viewBox="0 0 100 400" className={`h-[80%] w-auto max-w-full drop-shadow-[0_0_20px_rgba(16,185,129,0.3)] ${(state === 'turn_right_lateral' || state === 'right_lateral_capture') ? '-scale-x-100' : ''}`}
                            >
                                {/* Simple side profile outline */}
                                <path d="M50,20 C60,20 70,35 70,50 C70,65 60,80 50,80 C40,80 30,65 30,50 C30,35 40,20 50,20 Z M40,90 L60,90 C75,90 85,105 85,120 L80,180 C75,210 65,210 65,210 L65,360 C65,375 55,385 45,385 C35,385 25,375 25,360 L25,210 L25,210 C15,210 10,195 10,180 L15,120 C20,105 25,90 40,90 Z" fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth="2" strokeDasharray="6, 6" />
                            </motion.svg>
                        )}
                    </AnimatePresence>

                    {/* ── CINEMA SCAN BEAM ─────────────────────────── */}
                    {(state === 'frontal_capture' || state === 'left_lateral_capture' || state === 'right_lateral_capture') && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <motion.div
                                className="absolute left-0 right-0 h-[3px] pointer-events-none"
                                style={{
                                    background: 'linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.0) 10%, rgba(52,211,153,0.9) 50%, rgba(16,185,129,0.0) 90%, transparent 100%)',
                                    boxShadow: '0 0 24px 4px rgba(16,185,129,0.35), 0 0 2px rgba(52,211,153,1)',
                                }}
                                animate={{ top: ['12%', '88%', '12%'] }}
                                transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                            />
                            {/* Trailing wake glow */}
                            <motion.div
                                className="absolute left-0 right-0 h-16 pointer-events-none"
                                style={{
                                    background: 'linear-gradient(to bottom, rgba(16,185,129,0.0), rgba(16,185,129,0.04), rgba(16,185,129,0.0))',
                                }}
                                animate={{ top: ['8%', '80%', '8%'] }}
                                transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                            />
                        </div>
                    )}
                </div>

                {/* ── PROGRESS BAR ─────────────────────────────────── */}
                <div className="absolute inset-x-4 md:inset-x-8 bottom-4 md:bottom-6 z-20">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-mono text-emerald-500/50 uppercase tracking-widest">Acquisition</span>
                        <span className="text-[9px] font-mono text-emerald-400/70 tabular-nums">{Math.round(progress)}%</span>
                    </div>
                    <div className="h-[2px] w-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                            className="h-full bg-emerald-400"
                            style={{
                                width: `${progress}%`,
                                boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                                transition: 'width 100ms linear',
                            }}
                        />
                    </div>
                </div>

                {/* Success Overlay & Review Step */}
                {state === 'success' && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-zinc-950/95 backdrop-blur-2xl flex flex-col items-center justify-center z-[100] px-8 py-10"
                    >
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                            <Check className="w-8 h-8" />
                        </div>
                        <h3 className="text-3xl font-bold text-zinc-100 mb-2 tracking-tight">Biometric Scan Extracted</h3>
                        <p className="text-zinc-400 mb-8 font-medium">Verify your captures before saving to your profile.</p>

                        <div className="flex gap-4 w-full max-w-4xl justify-center mb-10">
                            {frontalImage && (
                                <div className="flex-1 max-w-[200px] aspect-[3/4] rounded-2xl overflow-hidden ring-1 ring-white/10 relative shadow-2xl group">
                                    <img src={frontalImage} alt="Frontal Capture" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-emerald-500/10 mix-blend-overlay" />
                                    <div className="absolute bottom-4 inset-x-4 flex justify-center">
                                        <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-black/80 px-3 py-1.5 rounded-full border border-emerald-500/30 backdrop-blur-md">Frontal Matrix</div>
                                    </div>
                                </div>
                            )}
                            {leftLateralImage && (
                                <div className="flex-1 max-w-[200px] aspect-[3/4] rounded-2xl overflow-hidden ring-1 ring-white/10 relative shadow-2xl group">
                                    <img src={leftLateralImage} alt="Left Lateral" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-emerald-500/10 mix-blend-overlay" />
                                    <div className="absolute bottom-4 inset-x-4 flex justify-center">
                                        <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-black/80 px-3 py-1.5 rounded-full border border-emerald-500/30 backdrop-blur-md">Left Triangulation</div>
                                    </div>
                                </div>
                            )}
                            {rightLateralImage && (
                                <div className="flex-1 max-w-[200px] aspect-[3/4] rounded-2xl overflow-hidden ring-1 ring-white/10 relative shadow-2xl group">
                                    <img src={rightLateralImage} alt="Right Lateral" className="w-full h-full object-cover -scale-x-100 transition-transform duration-700 group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-emerald-500/10 mix-blend-overlay" />
                                    <div className="absolute bottom-4 inset-x-4 flex justify-center">
                                        <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-black/80 px-3 py-1.5 rounded-full border border-emerald-500/30 backdrop-blur-md">Right Triangulation</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <AnimatedButton
                            onClick={() => finalMeasurements && onComplete(finalMeasurements)}
                            className="bg-emerald-500 hover:bg-emerald-400 text-black px-10 py-3 font-bold rounded-full shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                        >
                            Confirm & Save Profile
                        </AnimatedButton>
                    </motion.div>
                )}

            </PremiumCard>
        </div>
    );
}

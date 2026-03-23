"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DataGaugeProps {
    value: number; // 0 to 100
    label: string;
    size?: 'sm' | 'md' | 'lg';
    color?: 'emerald' | 'amber' | 'rose' | 'blue' | 'white';
    className?: string;
}

export function DataGauge({
    value,
    label,
    size = 'md',
    color = 'emerald',
    className
}: DataGaugeProps) {

    const sizeMap = {
        sm: { svg: 60, stroke: 4, text: "text-lg", labelText: "text-[10px]" },
        md: { svg: 96, stroke: 6, text: "text-2xl", labelText: "text-xs" },
        lg: { svg: 140, stroke: 8, text: "text-4xl", labelText: "text-sm" },
    };

    const colorMap = {
        emerald: "text-white stroke-white",
        amber: "text-[var(--text-secondary)] stroke-[var(--text-secondary)]",
        rose: "text-[var(--text-dim)] stroke-[var(--text-dim)]",
        blue: "text-white stroke-white",
        white: "text-white stroke-white",
    };

    const s = sizeMap[size];
    const radius = (s.svg - s.stroke) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    return (
        <div className={cn("flex flex-col items-center justify-center relative", className)}>
            <div className="relative flex items-center justify-center">
                {/* Background Track */}
                <svg
                    width={s.svg}
                    height={s.svg}
                    className="transform -rotate-90"
                >
                    <circle
                        cx={s.svg / 2}
                        cy={s.svg / 2}
                        r={radius}
                        strokeWidth={s.stroke}
                        fill="transparent"
                        className="stroke-[var(--border-default)]"
                    />
                    {/* Animated Fill */}
                    <motion.circle
                        cx={s.svg / 2}
                        cy={s.svg / 2}
                        r={radius}
                        strokeWidth={s.stroke}
                        fill="transparent"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className={cn("transition-all", colorMap[color])}
                        strokeLinecap="square"
                    />
                </svg>

                {/* Value Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className={cn("font-mono font-light tracking-tighter text-white", s.text)}
                    >
                        {value}
                    </motion.span>
                </div>
            </div>

            {/* Label */}
            <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className={cn("mt-2 text-[var(--text-secondary)] font-mono tracking-widest uppercase", s.labelText)}
            >
                {label}
            </motion.span>
        </div>
    );
}

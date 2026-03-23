"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface PremiumCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
    withHover?: boolean;
}

export function PremiumCard({
    children,
    className,
    withHover = false,
    ...props
}: PremiumCardProps) {
    return (
        <motion.div
            whileHover={withHover ? { y: -4, scale: 1.01 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={cn(
                "relative overflow-hidden",
                "bg-[var(--surface-primary)]", // Deep dark
                "border border-[var(--border-default)]", // Subtle border
                className
            )}
            {...props}
        >
            {/* Solid color override */}
            <div className="absolute inset-0 bg-transparent pointer-events-none" />

            <div className="relative z-10">{children}</div>
        </motion.div>
    );
}

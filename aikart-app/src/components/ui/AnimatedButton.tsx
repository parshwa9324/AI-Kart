"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface AnimatedButtonProps extends HTMLMotionProps<"button"> {
    children: React.ReactNode;
    className?: string;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    isLoading?: boolean;
}

export function AnimatedButton({
    children,
    className,
    variant = 'primary',
    isLoading = false,
    disabled,
    ...props
}: AnimatedButtonProps) {

    const baseStyles = "relative inline-flex items-center justify-center font-medium rounded-full transition-colors overflow-hidden px-6 py-3 text-sm";

    const variants = {
        primary: "bg-white text-black hover:bg-neutral-200",
        secondary: "bg-neutral-800 text-white hover:bg-neutral-700",
        outline: "border border-white/20 text-white hover:bg-white/10",
        ghost: "text-neutral-400 hover:text-white hover:bg-white/5",
    };

    return (
        <motion.button
            whileHover={disabled || isLoading ? undefined : { scale: 1.02 }}
            whileTap={disabled || isLoading ? undefined : { scale: 0.98 }}
            className={cn(
                baseStyles,
                variants[variant],
                (disabled || isLoading) && "opacity-50 cursor-not-allowed",
                className
            )}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute flex items-center justify-center inset-0 bg-inherit"
                >
                    <Loader2 className="w-5 h-5 animate-spin" />
                </motion.div>
            ) : null}

            <span className={cn(isLoading && "opacity-0")}>{children}</span>
        </motion.button>
    );
}

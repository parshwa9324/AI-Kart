'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { MinimalButton } from '../components/ui/MinimalButton';
import Link from 'next/link';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('[AI-Kart Global Error]', error);
    }, [error]);

    return (
        <html lang="en">
            <body className="bg-black text-white antialiased font-sans flex items-center justify-center min-h-screen">
                <div className="w-full max-w-md p-8 relative">
                    {/* Background glow */}
                    <div className="absolute inset-0 bg-red-900/10 blur-[100px] rounded-full pointer-events-none" />

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative z-10 border border-white/10 rounded-2xl bg-black/40 backdrop-blur-xl p-8 shadow-2xl overflow-hidden"
                    >
                        {/* Top Accent Line */}
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                                <AlertTriangle className="w-8 h-8 text-red-400" />
                            </div>

                            <div className="space-y-2 text-center">
                                <h2 className="text-xl font-medium tracking-wide text-white">Critical System Failure</h2>
                                <p className="text-neutral-400 text-sm leading-relaxed">
                                    The Atelier encountered an unrecoverable rendering exception. Our engineers have been notified.
                                </p>
                            </div>

                            <div className="w-full p-4 bg-black/50 border border-white/5 rounded-xl font-mono text-xs text-red-400/80 text-left overflow-auto max-h-32">
                                {error.message || "An unexpected runtime exception occurred."}
                                {error.digest && <div className="mt-2 text-neutral-500">Digest: {error.digest}</div>}
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => reset()}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                                >
                                    <RefreshCcw className="w-4 h-4" />
                                    Reboot State
                                </button>
                                <Link
                                    href="/"
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-white text-black hover:bg-neutral-200 rounded-xl text-sm font-medium transition-colors"
                                >
                                    <Home className="w-4 h-4" />
                                    Return Home
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </body>
        </html>
    );
}

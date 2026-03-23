'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';

export default function Login() {
    const [accessCode, setAccessCode] = useState('');
    const [status, setStatus] = useState<'idle' | 'authenticating' | 'rejected'>('idle');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('authenticating');

        // Simulate authentication
        setTimeout(() => {
            if (accessCode.length >= 6) {
                // Redirecting logic would go here
                window.location.href = '/admin';
            } else {
                setStatus('rejected');
                setTimeout(() => setStatus('idle'), 2000);
            }
        }, 1500);
    };

    return (
        <main className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center relative selection:bg-white selection:text-black">
            
            {/* Background elements */}
            <div className="absolute inset-0 bg-mesh opacity-30 mix-blend-screen pointer-events-none" />
            <div className="noise-overlay" />
            
            <header className="absolute top-0 w-full z-50 px-8 py-8 flex justify-center items-center">
                <div className="tracking-cinematic text-[10px] font-medium text-[var(--text-dim)] uppercase">
                    AI-KART / SECURE ACCESS
                </div>
            </header>

            <motion.div 
                className="relative z-10 w-full max-w-md px-8 flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.98, filter: 'blur(5px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 1.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
                <div className="w-8 h-8 rounded-none border border-[var(--border-default)] flex items-center justify-center mb-10">
                    <div className="w-2 h-2 bg-white" />
                </div>

                <h1 className="text-3xl font-light tracking-tight text-white mb-4 uppercase" style={{ letterSpacing: '-0.02em' }}>
                    PRIVATE TENANT
                </h1>
                
                <p className="text-[10px] uppercase font-mono tracking-widest text-[var(--text-secondary)] mb-12">
                    System awaiting credentials. Entry by invitation only.
                </p>

                <form onSubmit={handleLogin} className="w-full">
                    <div className="relative mb-8">
                        <input 
                            type="password" 
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            placeholder="ENTER ACCESS KEY"
                            className={`w-full bg-transparent border-b ${status === 'rejected' ? 'border-red-500 text-red-500' : 'border-[var(--border-subtle)] focus:border-white text-white'} py-4 px-0 text-center text-xs uppercase font-mono tracking-widest outline-none transition-colors duration-500 placeholder:text-[var(--text-dim)]`}
                            disabled={status === 'authenticating'}
                        />
                        {status === 'authenticating' && (
                            <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2">
                                <div className="w-2 h-2 bg-white animate-pulse" />
                            </div>
                        )}
                        {status === 'rejected' && (
                            <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2">
                                <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest">DENIED</span>
                            </div>
                        )}
                    </div>

                    <button 
                        type="submit" 
                        disabled={status !== 'idle' || accessCode.length === 0}
                        className="w-full py-4 text-[10px] tracking-cinematic uppercase bg-white text-black hover:bg-[#E0E0E0] transition-colors duration-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {status === 'authenticating' ? 'AUTHENTICATING...' : 'INITIALIZE HANDSHAKE'}
                    </button>
                </form>
                
                <div className="mt-12 pt-6 border-t border-[var(--border-subtle)] w-full text-center">
                    <Link href="/" className="text-[10px] uppercase font-mono text-[var(--text-dim)] hover:text-white transition-colors tracking-widest">
                        RETURN TO PUBLIC
                    </Link>
                </div>
            </motion.div>
        </main>
    );
}

/**
 * WelcomeToast.tsx — Luxury "Welcome Back" Notification
 *
 * Slides up from the bottom-right when a returning user's
 * Physical Twin is restored from the backend.
 *
 * Auto-dismisses after 5 seconds. Maison Noir design language.
 */

'use client';

import { useEffect, useState } from 'react';

interface WelcomeToastProps {
    /** Whether to show the toast */
    show: boolean;
    /** Optional custom message */
    message?: string;
}

export function WelcomeToast({ show, message }: WelcomeToastProps) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (!show) return;

        // Slight delay for the entrance animation
        const enterTimer = setTimeout(() => setVisible(true), 300);

        // Auto-dismiss after 5s
        const exitTimer = setTimeout(() => {
            setExiting(true);
            setTimeout(() => setVisible(false), 500);
        }, 5000);

        return () => {
            clearTimeout(enterTimer);
            clearTimeout(exitTimer);
        };
    }, [show]);

    if (!visible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 32,
                right: 32,
                zIndex: 9998,
                maxWidth: 380,
                background: 'linear-gradient(135deg, rgba(24, 17, 23, 0.95), rgba(30, 22, 28, 0.95))',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(230, 195, 100, 0.2)',
                padding: '20px 24px',
                fontFamily: "'Space Grotesk', sans-serif",
                transform: exiting ? 'translateY(20px)' : 'translateY(0)',
                opacity: exiting ? 0 : 1,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                animation: exiting ? 'none' : 'toast-slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), 0 0 80px rgba(230, 195, 100, 0.05)',
            }}
        >
            {/* Top gold accent line */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: '15%',
                    right: '15%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, #E6C364, transparent)',
                }}
            />

            {/* Header with icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div
                    style={{
                        width: 36,
                        height: 36,
                        border: '1px solid rgba(230, 195, 100, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        flexShrink: 0,
                    }}
                >
                    ✦
                </div>
                <div>
                    <p
                        style={{
                            margin: 0,
                            color: '#E6C364',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                        }}
                    >
                        Physical Twin
                    </p>
                    <p
                        style={{
                            margin: '4px 0 0',
                            color: '#D4C5B0',
                            fontSize: 14,
                            lineHeight: 1.4,
                        }}
                    >
                        {message || 'Welcome back — your body profile has been restored.'}
                    </p>
                </div>
            </div>

            {/* Dismiss button */}
            <button
                onClick={() => {
                    setExiting(true);
                    setTimeout(() => setVisible(false), 500);
                }}
                style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'none',
                    border: 'none',
                    color: '#7A6B5D',
                    fontSize: 14,
                    cursor: 'pointer',
                    padding: '4px 8px',
                    transition: 'color 0.2s',
                }}
                onMouseOver={(e) => {
                    (e.target as HTMLButtonElement).style.color = '#E6C364';
                }}
                onMouseOut={(e) => {
                    (e.target as HTMLButtonElement).style.color = '#7A6B5D';
                }}
            >
                ✕
            </button>

            {/* Inline keyframes for the slide animation */}
            <style>{`
                @keyframes toast-slide-up {
                    from {
                        transform: translateY(40px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}

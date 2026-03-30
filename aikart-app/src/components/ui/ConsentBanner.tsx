/**
 * ConsentBanner.tsx — GDPR Biometric Data Consent
 *
 * Shown once before the first body scan attempt.
 * Records consent timestamp in localStorage.
 * Styled to match the Maison Noir Haute luxury design system.
 *
 * What it tells the user:
 * - Body measurements are stored anonymously (no PII)
 * - Data can be permanently deleted at any time
 * - Consent is required before any body geometry is saved
 */

'use client';

import { useState } from 'react';

interface ConsentBannerProps {
    onConsent: () => void;
    onDecline?: () => void;
}

export function ConsentBanner({ onConsent, onDecline }: ConsentBannerProps) {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                background: 'linear-gradient(to top, rgba(24, 17, 23, 0.98), rgba(24, 17, 23, 0.92))',
                backdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(230, 195, 100, 0.15)',
                padding: '24px 32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '24px',
                fontFamily: "'Space Grotesk', sans-serif",
            }}
        >
            {/* Gold accent line */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: '10%',
                    right: '10%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, #E6C364, transparent)',
                }}
            />

            {/* Shield icon */}
            <div
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: 0,
                    border: '1px solid rgba(230, 195, 100, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#E6C364',
                    fontSize: 22,
                }}
            >
                🛡️
            </div>

            {/* Text */}
            <div style={{ maxWidth: 600, color: '#B8A99A' }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                    <span style={{ color: '#E6C364', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 11 }}>
                        Biometric Data Consent
                    </span>
                    <br />
                    Your body measurements are stored{' '}
                    <span style={{ color: '#D4C5B0' }}>anonymously</span> to restore your Physical
                    Twin on future visits. No personal data is collected. You may{' '}
                    <span style={{ color: '#E6C364' }}>permanently delete</span> your data at any
                    time.
                </p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                <button
                    onClick={() => {
                        onConsent();
                        setIsVisible(false);
                    }}
                    style={{
                        background: 'linear-gradient(135deg, #E6C364 0%, #C9A84C 100%)',
                        color: '#181117',
                        border: 'none',
                        padding: '10px 28px',
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'translateY(-1px)';
                        (e.target as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(230, 195, 100, 0.3)';
                    }}
                    onMouseOut={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                        (e.target as HTMLButtonElement).style.boxShadow = 'none';
                    }}
                >
                    I Consent
                </button>

                <button
                    onClick={() => {
                        onDecline?.();
                        setIsVisible(false);
                    }}
                    style={{
                        background: 'transparent',
                        color: '#7A6B5D',
                        border: '1px solid rgba(230, 195, 100, 0.15)',
                        padding: '10px 20px',
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                        (e.target as HTMLButtonElement).style.borderColor = 'rgba(230, 195, 100, 0.4)';
                        (e.target as HTMLButtonElement).style.color = '#B8A99A';
                    }}
                    onMouseOut={(e) => {
                        (e.target as HTMLButtonElement).style.borderColor = 'rgba(230, 195, 100, 0.15)';
                        (e.target as HTMLButtonElement).style.color = '#7A6B5D';
                    }}
                >
                    Decline
                </button>
            </div>
        </div>
    );
}

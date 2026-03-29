/**
 * PhysicalTwinProvider.tsx — Global Boot Orchestrator
 *
 * Wraps the entire app in layout.tsx. On mount:
 * 1. Calls usePhysicalTwin() → loads saved profile from backend
 * 2. If profile restored → shows WelcomeToast
 * 3. If no consent yet → shows ConsentBanner before first scan
 *
 * This is a client component — it handles all the lifecycle
 * logic so that individual pages don't need to worry about
 * checking localStorage or calling the profile API.
 */

'use client';

import { ReactNode, createContext, useContext } from 'react';
import { usePhysicalTwin } from '../hooks/usePhysicalTwin';
import { WelcomeToast } from './ui/WelcomeToast';
import { ConsentBanner } from './ui/ConsentBanner';

interface Props {
    children: ReactNode;
}

type PhysicalTwinContextValue = ReturnType<typeof usePhysicalTwin>;

const PhysicalTwinContext = createContext<PhysicalTwinContextValue | null>(null);

export function usePhysicalTwinContext(): PhysicalTwinContextValue {
    const ctx = useContext(PhysicalTwinContext);
    if (!ctx) {
        throw new Error('usePhysicalTwinContext must be used within PhysicalTwinProvider');
    }
    return ctx;
}

export function PhysicalTwinProvider({ children }: Props) {
    const twin = usePhysicalTwin();
    const {
        isRestored,
        hasConsent,
        giveConsent,
    } = twin;

    return (
        <PhysicalTwinContext.Provider value={twin}>
            {children}

            {/* Welcome toast — shows when profile is restored from backend */}
            <WelcomeToast show={isRestored} />

            {/* GDPR consent — shows once, before any body data is stored */}
            {!hasConsent && (
                <ConsentBanner
                    onConsent={giveConsent}
                    onDecline={() => {
                        // User declined — we still let them use the app,
                        // but body scans won't be persisted across sessions.
                        console.log('[PhysicalTwin] User declined consent — scans will not be saved.');
                    }}
                />
            )}
        </PhysicalTwinContext.Provider>
    );
}

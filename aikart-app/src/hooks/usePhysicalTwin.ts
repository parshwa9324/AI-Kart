/**
 * usePhysicalTwin.ts — Physical Twin Persistence Hook
 *
 * Orchestrates the full lifecycle of a user's body profile:
 *
 * 1. On first visit → generates UUID session_token → stores in localStorage
 * 2. On app boot   → checks localStorage for token → calls backend GET /profile/{token}
 * 3. On scan done  → saves profile to backend POST /profile/save
 * 4. On delete     → calls backend DELETE /profile/{token} → clears localStorage
 *
 * This means returning users instantly get their Physical Twin back
 * without re-scanning — the "Welcome back" experience.
 */

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { usePoseStore } from '../store/PoseStore';
import { AIKartAPI } from '../ar-engine/APIClient';
import type { UserBodyProfile, ScanMethod } from '../types/types';

const SESSION_TOKEN_KEY = 'aikart_session_token';
const CONSENT_KEY      = 'aikart_consent_timestamp';
const RENDER_HISTORY_KEY = 'aikart_render_history_v1';

export interface RenderHistoryItem {
    imageUrl: string;
    thumbUrl: string | null;
    beforeImageUrl: string | null;
    fitScore: number;
    garmentName: string;
    createdAt: string;
}

/**
 * Generate or retrieve the anonymous session token from localStorage.
 * This token is the only identifier — no PII, no cookies, no fingerprinting.
 */
function getOrCreateSessionToken(): string {
    if (typeof window === 'undefined') return '';

    let token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
        // Cryptographically random 32-hex UUID
        token = crypto.randomUUID().replace(/-/g, '');
        localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    return token;
}

export interface PhysicalTwinState {
    /** Whether we're currently loading the profile from the backend */
    isLoading: boolean;
    /** Whether a saved Physical Twin was found and restored */
    isRestored: boolean;
    /** Session token (anonymous UUID) */
    sessionToken: string;
    /** Whether the user has given GDPR consent for body data storage */
    hasConsent: boolean;
    /** Error message if profile load/save failed */
    error: string | null;
    /** Last renders for quick restore in try-on */
    renderHistory: RenderHistoryItem[];
}

export function usePhysicalTwin() {
    const [state, setState] = useState<PhysicalTwinState>({
        isLoading: true,
        isRestored: false,
        sessionToken: '',
        hasConsent: false,
        error: null,
        renderHistory: [],
    });
    const initRef = useRef(false);

    const setBodyProfile = usePoseStore((s) => s.setBodyProfile);

    // ── Boot: Try to restore Physical Twin from backend ──────────
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        const token = getOrCreateSessionToken();
        const consent = localStorage.getItem(CONSENT_KEY);

        setState((s) => ({
            ...s,
            sessionToken: token,
            hasConsent: !!consent,
        }));

        try {
            const historyRaw = localStorage.getItem(RENDER_HISTORY_KEY);
            if (historyRaw) {
                const parsed = JSON.parse(historyRaw) as RenderHistoryItem[];
                if (Array.isArray(parsed)) {
                    setState((s) => ({ ...s, renderHistory: parsed.slice(0, 3) }));
                }
            }
        } catch {
            // ignore malformed history payload
        }

        // Attempt to load saved profile
        AIKartAPI.loadProfile(token)
            .then((result) => {
                if (result && result.profile) {
                    const p = result.profile;
                    // Reconstruct UserBodyProfile from backend data
                    const profile: UserBodyProfile = {
                        userId: token,
                        heightCm: (p.height_cm as number) || 170,
                        measurements: {
                            chestCircumference:  (p.chest_cm as number)    || 0,
                            waistCircumference:  (p.waist_cm as number)    || 0,
                            hipCircumference:    (p.hip_cm as number)      || 0,
                            shoulderWidth:       (p.shoulder_cm as number) || 0,
                            armLength:           (p.sleeve_cm as number)   || 0,
                            torsoLength:         (p.inseam_cm as number)   || 0,
                            inseam:              (p.inseam_cm as number)   || 0,
                            neckCircumference:   (p.neck_cm as number)     || 0,
                        },
                        scanMethod: ((p.scan_method as string) || 'sam3d_body') as ScanMethod,
                        measuredAt: (p.updated_at as string) || new Date().toISOString(),
                        confidence: (p.confidence_score as number) || 0.85,
                    };

                    setBodyProfile(profile);
                    setState((s) => ({ ...s, isLoading: false, isRestored: true }));
                    console.log('[PhysicalTwin] ✓ Profile restored from backend.');
                } else {
                    setState((s) => ({ ...s, isLoading: false, isRestored: false }));
                    console.log('[PhysicalTwin] No saved profile found — first visit.');
                }
            })
            .catch((err) => {
                console.warn('[PhysicalTwin] Profile load failed:', err);
                setState((s) => ({ ...s, isLoading: false, error: 'Profile load failed' }));
            });
    }, [setBodyProfile]);

    // ── Save: Persist profile to backend after scan ──────────────
    const saveProfile = useCallback(
        async (bodyProfile: UserBodyProfile) => {
            const token = getOrCreateSessionToken();
            const consentTs = localStorage.getItem(CONSENT_KEY) || new Date().toISOString();

            try {
                await AIKartAPI.saveProfile({
                    session_token: token,
                    height_cm:    bodyProfile.heightCm,
                    chest_cm:     bodyProfile.measurements.chestCircumference,
                    waist_cm:     bodyProfile.measurements.waistCircumference,
                    hip_cm:       bodyProfile.measurements.hipCircumference,
                    shoulder_cm:  bodyProfile.measurements.shoulderWidth,
                    inseam_cm:    bodyProfile.measurements.inseam,
                    sleeve_cm:    bodyProfile.measurements.armLength,
                    neck_cm:      bodyProfile.measurements.neckCircumference,
                    scan_method:  bodyProfile.scanMethod || 'ratio',
                    confidence_score: bodyProfile.confidence,
                    consent_given_at: consentTs,
                });
                console.log('[PhysicalTwin] ✓ Profile saved to backend.');
            } catch (err) {
                console.error('[PhysicalTwin] Profile save failed:', err);
            }
        },
        []
    );

    // ── GDPR: Record consent timestamp ──────────────────────────
    const giveConsent = useCallback(async () => {
        const ts = new Date().toISOString();
        localStorage.setItem(CONSENT_KEY, ts);
        setState((s) => ({ ...s, hasConsent: true }));
        console.log('[PhysicalTwin] GDPR consent recorded locally:', ts);
        
        try {
            const token = getOrCreateSessionToken();
            await AIKartAPI.recordConsent(token, true);
            console.log('[PhysicalTwin] GDPR consent saved to backend.');
        } catch (err) {
            console.error('[PhysicalTwin] Failed to save consent to backend (will retry on profile save):', err);
        }
    }, []);

    // ── GDPR: Delete all data (Right to Erasure) ────────────────
    const deleteAllData = useCallback(async () => {
        const token = getOrCreateSessionToken();
        try {
            await AIKartAPI.deleteProfile(token);
            // Clear local state
            localStorage.removeItem(SESSION_TOKEN_KEY);
            localStorage.removeItem(CONSENT_KEY);
            localStorage.removeItem(RENDER_HISTORY_KEY);
            setBodyProfile(null);
            setState({
                isLoading: false,
                isRestored: false,
                sessionToken: '',
                hasConsent: false,
                error: null,
                renderHistory: [],
            });
            console.log('[PhysicalTwin] ✓ All data permanently erased (GDPR).');
        } catch (err) {
            console.error('[PhysicalTwin] GDPR delete failed:', err);
        }
    }, [setBodyProfile]);

    const addRenderToHistory = useCallback((item: RenderHistoryItem) => {
        setState((s) => {
            const deduped = s.renderHistory.filter((h) => h.imageUrl !== item.imageUrl);
            const next = [item, ...deduped].slice(0, 3);
            try {
                localStorage.setItem(RENDER_HISTORY_KEY, JSON.stringify(next));
            } catch {
                // ignore localStorage write failures
            }
            return { ...s, renderHistory: next };
        });
    }, []);

    const clearRenderHistory = useCallback(() => {
        localStorage.removeItem(RENDER_HISTORY_KEY);
        setState((s) => ({ ...s, renderHistory: [] }));
    }, []);

    return {
        ...state,
        saveProfile,
        giveConsent,
        deleteAllData,
        addRenderToHistory,
        clearRenderHistory,
    };
}

'use client';

import { useState, useEffect } from 'react';
import { extractYouTubePlaylistId, extractYouTubeChannelIdentifier } from '@/lib/youtube/api';
import { Link as LinkIcon, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface Timetable {
    id: string;
    title: string;
    description: string | null;
    is_public: boolean;
    source_type: string | null;
    source_id: string | null;
}

interface Props {
    timetable: Timetable;
    aiTheme: string | null;
}

const AI_LOADING_MESSAGES = [
    'AI is re-curating your theme…',
    'Searching YouTube…',
    'Rebuilding your channel…',
    'Almost there…',
];

export default function EditChannel({ timetable, aiTheme }: Props) {
    const isAi = timetable.source_type === 'ai';

    const initialUrl = timetable.source_id
        ? `https://www.youtube.com/playlist?list=${timetable.source_id}`
        : '';

    const [title, setTitle] = useState(timetable.title);
    const [description, setDescription] = useState(timetable.description ?? '');
    const [isPublic, setIsPublic] = useState(timetable.is_public);
    // Playlist fields
    const [urlInput, setUrlInput] = useState(initialUrl);
    // AI fields
    const [theme, setTheme] = useState(aiTheme ?? '');

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

    const isValidSourceUrl = !!extractYouTubePlaylistId(urlInput) || !!extractYouTubeChannelIdentifier(urlInput);
    const willRegeneratePlaylist = !isAi && isValidSourceUrl && urlInput.trim() !== initialUrl;
    const willRegenerateAi = isAi && theme.trim() !== (aiTheme ?? '');
    const willRegenerate = willRegeneratePlaylist || willRegenerateAi;

    useEffect(() => {
        if (!isSaving || !willRegenerate) { setLoadingMsgIdx(0); return; }
        const timer = setInterval(() => {
            setLoadingMsgIdx(i => Math.min(i + 1, AI_LOADING_MESSAGES.length - 1));
        }, 2200);
        return () => clearInterval(timer);
    }, [isSaving, willRegenerate]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title) { setError('Channel name is required.'); return; }
        if (!isAi && urlInput.trim() && !isValidSourceUrl) {
            setError('Enter a valid YouTube playlist or channel URL.');
            return;
        }

        try {
            setIsSaving(true);
            setError('');

            const endpoint = isAi ? '/api/curate/ai' : '/api/curate/playlist';
            const body: Record<string, unknown> = {
                timetableId: timetable.id,
                title,
                description,
                isPublic,
            };

            if (isAi && willRegenerateAi) {
                body.theme = theme.trim();
            } else if (!isAi && willRegeneratePlaylist) {
                body.sourceUrl = urlInput.trim();
            }

            const res = await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save changes');
            }
            window.location.href = '/dashboard';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message || 'Something went wrong.');
        } finally {
            setIsSaving(false);
        }
    };

    const canSubmit = !isSaving && !!title;

    let submitLabel = 'Save Changes';
    if (isSaving) {
        submitLabel = willRegenerate
            ? (isAi ? AI_LOADING_MESSAGES[loadingMsgIdx] : 'Regenerating…')
            : 'Saving…';
    }

    return (
        <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', fontFamily: 'inherit', display: 'flex', flexDirection: 'column' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem 2.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <Link href="/dashboard" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>← Dashboard</Link>
                <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem' }}>|</span>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>Edit Channel</span>
                {isAi && (
                    <span style={{ fontSize: '0.65rem', color: 'rgba(169,255,28,0.5)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Sparkles size={11} />AI Auto-Curate
                    </span>
                )}
            </div>

            <form
                onSubmit={handleSave}
                style={{ flex: 1, maxWidth: '600px', width: '100%', margin: '0 auto', padding: '4rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}
            >
                {/* Channel name */}
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Channel name"
                    autoFocus
                    style={{
                        fontSize: '2rem',
                        fontWeight: 300,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff',
                        padding: '0.25rem 0 0.5rem',
                        width: '100%',
                        outline: 'none',
                    }}
                />

                {/* Description */}
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description  (optional)"
                    rows={2}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.5)',
                        padding: '0.25rem 0 0.5rem',
                        width: '100%',
                        outline: 'none',
                        resize: 'none',
                        fontSize: '0.95rem',
                        fontFamily: 'inherit',
                    }}
                />

                {/* Source-specific input */}
                {isAi ? (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', borderBottom: '1px solid rgba(169,255,28,0.2)', paddingBottom: '0.5rem' }}>
                            <Sparkles size={15} color="rgba(169,255,28,0.5)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                            <textarea
                                value={theme}
                                onChange={(e) => setTheme(e.target.value)}
                                placeholder="Describe the vibe, mood, or topic of your channel."
                                rows={3}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#fff',
                                    width: '100%',
                                    outline: 'none',
                                    resize: 'none',
                                    fontSize: '0.9rem',
                                    fontFamily: 'inherit',
                                    lineHeight: 1.6,
                                }}
                            />
                        </div>
                        {willRegenerateAi && (
                            <p style={{ fontSize: '0.72rem', color: 'rgba(255,200,80,0.7)', marginTop: '0.4rem' }}>
                                Theme changed — AI will regenerate search queries and rebuild the schedule.
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '0.5rem' }}>
                            <LinkIcon size={15} color="rgba(255,255,255,0.25)" style={{ flexShrink: 0 }} />
                            <input
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder="YouTube Playlist or Channel URL"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#fff',
                                    width: '100%',
                                    outline: 'none',
                                    fontSize: '0.9rem',
                                    fontFamily: 'inherit',
                                }}
                            />
                        </div>
                        {willRegeneratePlaylist && (
                            <p style={{ fontSize: '0.72rem', color: 'rgba(255,200,80,0.7)', marginTop: '0.4rem' }}>
                                Playlist changed — schedule will be regenerated.
                            </p>
                        )}
                    </div>
                )}

                {/* Public toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        style={{ accentColor: '#A9FF1C', width: '1rem', height: '1rem' }}
                    />
                    <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>Publish publicly</span>
                </label>

                {/* Error */}
                {error && (
                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,100,100,0.85)', margin: 0 }}>{error}</p>
                )}

                {/* Submit */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '1rem' }}>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        style={{
                            padding: '0.65rem 2rem',
                            backgroundColor: canSubmit ? '#A9FF1C' : '#1a1a1a',
                            color: canSubmit ? '#000' : 'rgba(255,255,255,0.15)',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit',
                        }}
                    >
                        {submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}

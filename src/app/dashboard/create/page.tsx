'use client';

import { useState, useEffect } from 'react';
import { extractYouTubePlaylistId, extractYouTubeChannelIdentifier } from '@/lib/youtube/api';
import { Link as LinkIcon, Sparkles, Tv2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Mode = 'playlist' | 'ai' | 'import';

function extractTubeoursChannelId(url: string): string | null {
    const match = url.match(/\/channel\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1] : null;
}

const AI_LOADING_MESSAGES = [
    'AI is curating your theme…',
    'Searching YouTube…',
    'Building your channel…',
    'Almost there…',
];

export default function CreateChannel() {
    const [mode, setMode] = useState<Mode>('playlist');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    // Playlist mode
    const [urlInput, setUrlInput] = useState('');
    // AI mode
    const [theme, setTheme] = useState('');
    // Import mode
    const [importUrl, setImportUrl] = useState('');
    // State
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');
    const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

    // Cycle loading messages while generating
    useEffect(() => {
        if (!isGenerating) { setLoadingMsgIdx(0); return; }
        const timer = setInterval(() => {
            setLoadingMsgIdx(i => Math.min(i + 1, AI_LOADING_MESSAGES.length - 1));
        }, 2200);
        return () => clearInterval(timer);
    }, [isGenerating]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (mode !== 'import' && !title) {
            setError('Channel name is required.');
            return;
        }

        if (mode === 'playlist') {
            if (!urlInput) { setError('Playlist or channel URL is required.'); return; }
            const isPlaylist = !!extractYouTubePlaylistId(urlInput);
            const isChannel = !!extractYouTubeChannelIdentifier(urlInput);
            if (!isPlaylist && !isChannel) {
                setError('Enter a valid YouTube playlist or channel URL.');
                return;
            }
            try {
                setIsGenerating(true);
                const res = await fetch('/api/curate/playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description, isPublic, sourceUrl: urlInput }),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to create channel');
                }
                window.location.href = '/dashboard';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                setError(err.message || 'Something went wrong.');
                setIsGenerating(false);
            }
        } else if (mode === 'ai') {
            if (!theme.trim()) { setError('Please describe the theme for your channel.'); return; }
            try {
                setIsGenerating(true);
                const res = await fetch('/api/curate/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description, isPublic, theme: theme.trim() }),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to create channel');
                }
                window.location.href = '/dashboard';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                setError(err.message || 'Something went wrong.');
                setIsGenerating(false);
            }
        } else {
            // import mode
            const channelId = extractTubeoursChannelId(importUrl);
            if (!channelId) { setError('Enter a valid tubeours channel link.'); return; }
            try {
                setIsGenerating(true);
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not authenticated');
                const { error: dbError } = await supabase
                    .from('channel_follows')
                    .upsert({ user_id: user.id, timetable_id: channelId }, { onConflict: 'user_id,timetable_id' });
                if (dbError) throw dbError;
                window.location.href = '/dashboard';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                setError(err.message || 'Something went wrong.');
                setIsGenerating(false);
            }
        }
    };

    const canSubmit = !isGenerating && (
        mode === 'playlist' ? (!!title && !!urlInput) :
        mode === 'ai' ? (!!title && !!theme.trim()) :
        !!importUrl
    );

    const loadingLabel = mode === 'ai'
        ? AI_LOADING_MESSAGES[loadingMsgIdx]
        : mode === 'import' ? 'Importing…'
        : 'Creating…';

    return (
        <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', fontFamily: 'inherit', display: 'flex', flexDirection: 'column' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem 2.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <Link href="/dashboard" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>← Dashboard</Link>
                <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem' }}>|</span>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>New Channel</span>
            </div>

            <form
                onSubmit={handleSubmit}
                style={{ flex: 1, maxWidth: '600px', width: '100%', margin: '0 auto', padding: '3.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}
            >
                {/* Mode toggle */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <ModeTab
                        label="Playlist"
                        active={mode === 'playlist'}
                        onClick={() => { setMode('playlist'); setError(''); }}
                    />
                    <ModeTab
                        label="AI Auto-Curate"
                        active={mode === 'ai'}
                        onClick={() => { setMode('ai'); setError(''); }}
                        accent
                    />
                    <ModeTab
                        label="tubeours Channel"
                        active={mode === 'import'}
                        onClick={() => { setMode('import'); setError(''); }}
                    />
                </div>

                {/* Import mode: just a URL input */}
                {mode === 'import' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.6 }}>
                            Paste a shared tubeours channel link to add it to your channel list. You&apos;ll watch in sync with the original schedule.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '0.5rem' }}>
                            <Tv2 size={15} color="rgba(255,255,255,0.25)" style={{ flexShrink: 0 }} />
                            <input
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                placeholder="https://tubeours.app/channel/…"
                                autoFocus
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
                    </div>
                ) : (
                <>

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

                {/* Mode-specific input */}
                {mode === 'playlist' ? (
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
                ) : (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', borderBottom: '1px solid rgba(169,255,28,0.2)', paddingBottom: '0.5rem' }}>
                            <Sparkles size={15} color="rgba(169,255,28,0.5)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                            <textarea
                                value={theme}
                                onChange={(e) => setTheme(e.target.value)}
                                placeholder={`Describe the vibe, mood, or topic of your channel.\n\nExamples: "三島由紀夫のスピーチ"  •  "lo-fi hip hop for late nights"  •  "最新のAI・テクノロジーニュース"`}
                                rows={4}
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
                        <p style={{ fontSize: '0.68rem', color: 'rgba(169,255,28,0.35)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                            AI will generate search queries from your theme and build an endlessly refreshing schedule.
                        </p>
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
                </>
                )}

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
                            backgroundColor: canSubmit ? (mode === 'ai' ? '#A9FF1C' : '#A9FF1C') : '#1a1a1a',
                            color: canSubmit ? '#000' : 'rgba(255,255,255,0.15)',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit',
                            letterSpacing: isGenerating ? '0.04em' : undefined,
                        }}
                    >
                        {isGenerating ? loadingLabel : mode === 'import' ? 'Import Channel' : 'Create Channel'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function ModeTab({ label, active, onClick, accent }: {
    label: string;
    active: boolean;
    onClick: () => void;
    accent?: boolean;
}) {
    const activeColor = accent ? '#A9FF1C' : '#fff';
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
                color: active ? activeColor : 'rgba(255,255,255,0.28)',
                padding: '0 0 0.7rem',
                marginRight: '1.75rem',
                marginBottom: '-1px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: active ? 600 : 400,
                fontFamily: 'inherit',
                letterSpacing: '0.02em',
                transition: 'color 0.15s, border-color 0.15s',
            }}
        >
            {label}
        </button>
    );
}

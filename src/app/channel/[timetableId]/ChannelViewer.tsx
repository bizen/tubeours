'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import YouTubePlayer from '@/components/player/YouTubePlayer';
import { Power, LayoutGrid } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';
import ScheduleOverlay from './ScheduleOverlay';
import LogoText from '@/components/LogoText';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import styles from '../../page.module.css';

interface VideoData {
    youtube_video_id: string;
    title: string;
}

interface SlotData {
    id: string;
    scheduled_start_timestamp: string;
    videos: VideoData | VideoData[];
}

interface OverlayTimetable {
    id: string;
    title: string;
    description: string | null;
    is_public: boolean;
    timetable_slots: { count: number }[];
}

interface Props {
    timetableId: string;
    timetableTitle: string;
    initialSlot: SlotData | null;
    channelIds: string[];
    currentIndex: number;
    autoplay: boolean;
    displayMode: 'fill' | 'fit';
    overlayTimetables: OverlayTimetable[];
    overlayCurrentSlots: Record<string, { title: string }>;
    overlayNextSlots: Record<string, { title: string; time: string }>;
}

function getVideo(slot: SlotData): VideoData {
    return Array.isArray(slot.videos) ? slot.videos[0] : slot.videos;
}

function formatScheduledTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function fetchSlotAfter(timetableId: string, afterTimestamp: string): Promise<SlotData | null> {
    const supabase = createClient();
    const { data } = await supabase
        .from('timetable_slots')
        .select('id, scheduled_start_timestamp, videos(youtube_video_id, title)')
        .eq('timetable_id', timetableId)
        .gt('scheduled_start_timestamp', afterTimestamp)
        .order('scheduled_start_timestamp', { ascending: true })
        .limit(1)
        .single();
    return data ?? null;
}

async function fetchFirstSlot(timetableId: string): Promise<SlotData | null> {
    const supabase = createClient();
    const { data } = await supabase
        .from('timetable_slots')
        .select('id, scheduled_start_timestamp, videos(youtube_video_id, title)')
        .eq('timetable_id', timetableId)
        .order('scheduled_start_timestamp', { ascending: true })
        .limit(1)
        .single();
    return data ?? null;
}

async function fetchNextSlot(timetableId: string, afterTimestamp: string): Promise<SlotData | null> {
    const next = await fetchSlotAfter(timetableId, afterTimestamp);
    return next ?? fetchFirstSlot(timetableId);
}

export default function ChannelViewer({ timetableId, timetableTitle, initialSlot, channelIds, currentIndex, autoplay, displayMode: initialDisplayMode, overlayTimetables, overlayCurrentSlots, overlayNextSlots }: Props) {
    const router = useRouter();
    const [currentSlot, setCurrentSlot] = useState<SlotData | null>(initialSlot);
    const [nextSlot, setNextSlot] = useState<SlotData | null>(null);
    const [hasStarted, setHasStarted] = useState(false);
    const [startSeconds, setStartSeconds] = useState(0);
    const [time, setTime] = useState('');
    const [displayMode, setDisplayMode] = useState<'fill' | 'fit'>(initialDisplayMode);
    const [showOverlay, setShowOverlay] = useState(false);
    const [scheduleTarget, setScheduleTarget] = useState<{ id: string; title: string } | null>(null);

    const showOverlayRef = useRef(false);
    useEffect(() => { showOverlayRef.current = showOverlay || !!scheduleTarget; }, [showOverlay, scheduleTarget]);

    const handleModeChange = async (mode: 'fill' | 'fit') => {
        setDisplayMode(mode);
        const supabase = createClient();
        await supabase.auth.updateUser({ data: { display_mode: mode } });
    };
    const [keyFeedback, setKeyFeedback] = useState<{ kind: 'left' | 'right' | 'num' | 'up' | 'down'; n?: number; id: number; empty?: boolean } | null>(null);
    const [volume, setVolume] = useState(() => {
        if (typeof window === 'undefined') return 100;
        return Number(localStorage.getItem('tubeours_volume') ?? 100);
    });
    const [showVolume, setShowVolume] = useState(false);
    const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Ref so keyboard handler always sees latest hasStarted without re-registering
    const hasStartedRef = useRef(false);
    useEffect(() => { hasStartedRef.current = hasStarted; }, [hasStarted]);

    // Ref so keyboard handler always sees latest handleTurnOn without stale closure
    const handleTurnOnRef = useRef<() => Promise<void>>(() => Promise.resolve());

    // Refs for key feedback (setKeyFeedback is stable, so safe to use in handler)
    const feedbackIdRef = useRef(0);
    const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Clock
    useEffect(() => {
        const update = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);

    // Auto-start when navigating from another playing channel
    useEffect(() => {
        if (autoplay && initialSlot) {
            const elapsed = Math.max(0, Math.floor(
                (Date.now() - new Date(initialSlot.scheduled_start_timestamp).getTime()) / 1000
            ));
            setStartSeconds(elapsed);
            setHasStarted(true);
            fetchNextSlot(timetableId, initialSlot.scheduled_start_timestamp).then(setNextSlot);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keyboard channel navigation + Space toggle
    useEffect(() => {
        const flash = (kind: 'left' | 'right' | 'num' | 'up' | 'down', n?: number, empty?: boolean) => {
            clearTimeout(feedbackTimer.current);
            feedbackIdRef.current++;
            setKeyFeedback({ kind, n, id: feedbackIdRef.current, empty });
            feedbackTimer.current = setTimeout(() => setKeyFeedback(null), 850);
        };

        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (showOverlayRef.current) return;

            if (e.key === ' ') {
                e.preventDefault();
                if (hasStartedRef.current) {
                    setHasStarted(false);
                } else {
                    handleTurnOnRef.current();
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setVolume(v => { const next = Math.min(100, v + 5); localStorage.setItem('tubeours_volume', String(next)); return next; });
                clearTimeout(volumeTimerRef.current);
                setShowVolume(true);
                volumeTimerRef.current = setTimeout(() => setShowVolume(false), 1200);
                flash('up');
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setVolume(v => { const next = Math.max(0, v - 5); localStorage.setItem('tubeours_volume', String(next)); return next; });
                clearTimeout(volumeTimerRef.current);
                setShowVolume(true);
                volumeTimerRef.current = setTimeout(() => setShowVolume(false), 1200);
                flash('down');
                return;
            }

            if (channelIds.length <= 1) return;

            const playing = hasStartedRef.current;
            const suffix = playing ? '?autoplay=1' : '';

            if (e.key === 'ArrowRight') {
                flash('right');
                const id = channelIds[(currentIndex + 1) % channelIds.length];
                router.push(`/channel/${id}${suffix}`);
            } else if (e.key === 'ArrowLeft') {
                flash('left');
                const id = channelIds[(currentIndex - 1 + channelIds.length) % channelIds.length];
                router.push(`/channel/${id}${suffix}`);
            } else if (e.key >= '1' && e.key <= '9') {
                const idx = parseInt(e.key) - 1;
                if (idx < channelIds.length && idx !== currentIndex) {
                    flash('num', idx + 1);
                    router.push(`/channel/${channelIds[idx]}${suffix}`);
                } else if (idx >= channelIds.length && idx < 9) {
                    flash('num', idx + 1, true);
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [channelIds, currentIndex, router]);

    const handleTurnOn = async () => {
        if (!currentSlot) return;
        const elapsed = Math.max(0, Math.floor(
            (Date.now() - new Date(currentSlot.scheduled_start_timestamp).getTime()) / 1000
        ));
        setStartSeconds(elapsed);
        setHasStarted(true);
        const next = await fetchNextSlot(timetableId, currentSlot.scheduled_start_timestamp);
        setNextSlot(next);
    };
    handleTurnOnRef.current = handleTurnOn;

    const handleVideoEnd = useCallback(async () => {
        const incoming = nextSlot ?? await fetchFirstSlot(timetableId);
        if (!incoming) return;
        setCurrentSlot(incoming);
        setStartSeconds(0);
        setNextSlot(null);
        const next = await fetchNextSlot(timetableId, incoming.scheduled_start_timestamp);
        setNextSlot(next);
    }, [nextSlot, timetableId]);

    const chLabel = currentIndex >= 0 ? `CH·${String(currentIndex + 1).padStart(2, '0')}  ` : '';

    if (!currentSlot) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', backgroundColor: '#000', gap: '1.5rem' }}>
                <p style={{ opacity: 0.4 }}>No schedule available for this channel.</p>
                <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', textDecoration: 'none' }}>
                    ← Back to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {!hasStarted ? (
                <div className={styles.standbyScreen} onClick={handleTurnOn}>
                    <button className={styles.powerButton}>
                        <Power size={48} strokeWidth={1} />
                        <span className={styles.powerText}>Turn on TV</span>
                    </button>
                    <p style={{ position: 'absolute', bottom: '4rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {chLabel}{timetableTitle}
                    </p>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', bottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                    >
                        <button
                            onClick={() => handleModeChange('fill')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: displayMode === 'fill' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit' }}
                        >Fill</button>
                        <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                        <button
                            onClick={() => handleModeChange('fit')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: displayMode === 'fit' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit' }}
                        >Fit</button>
                    </div>
                    <Link
                        href="/dashboard"
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', top: '2rem', right: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', textDecoration: 'none', letterSpacing: '0.05em' }}
                    >
                        Dashboard →
                    </Link>
                </div>
            ) : (
                <>
                    <header className={styles.header}>
                        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <h1 className={styles.logo}><LogoText /></h1>
                        </Link>
                        <p className={styles.channelInfo}>
                            {chLabel}{timetableTitle} • {getVideo(currentSlot).title}
                        </p>
                    </header>


                    <main className={styles.main}>
                        <YouTubePlayer
                            key={currentSlot.id}
                            videoId={getVideo(currentSlot).youtube_video_id}
                            startSeconds={startSeconds}
                            onEnd={handleVideoEnd}
                            displayMode={displayMode}
                            volume={volume}
                        />
                    </main>

                    {time && (
                        <div className={styles.clockGroup}>
                            <div className={styles.clock}>{time}</div>
                            {nextSlot && (
                                <p className={styles.nextInfo}>
                                    next · {formatScheduledTime(nextSlot.scheduled_start_timestamp)} · {getVideo(nextSlot).title}
                                </p>
                            )}
                        </div>
                    )}

                    <button
                        className={styles.dashboardButton}
                        onClick={() => setShowOverlay(true)}
                        aria-label="Open dashboard"
                    >
                        <LayoutGrid size={24} strokeWidth={1.5} />
                    </button>

                    <button
                        className={styles.powerOffButton}
                        onClick={() => setHasStarted(false)}
                        aria-label="Turn off TV"
                    >
                        <Power size={24} strokeWidth={1.5} />
                    </button>
                </>
            )}
            <div className={styles.scanlines} />

            {showOverlay && (
                <DashboardOverlay
                    timetables={overlayTimetables}
                    currentSlots={overlayCurrentSlots}
                    nextSlots={overlayNextSlots}
                    onClose={() => setShowOverlay(false)}
                    onOpenSchedule={(id, title) => { setShowOverlay(false); setScheduleTarget({ id, title }); }}
                />
            )}

            {scheduleTarget && (
                <ScheduleOverlay
                    timetableId={scheduleTarget.id}
                    timetableTitle={scheduleTarget.title}
                    onClose={() => setScheduleTarget(null)}
                />
            )}

            {showVolume && (
                <div style={{
                    position: 'fixed', bottom: '6rem', left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    background: 'rgba(0,0,0,0.6)', borderRadius: '999px',
                    padding: '0.4rem 0.9rem', zIndex: 100, pointerEvents: 'none',
                }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>
                        {volume === 0 ? '🔇' : volume < 40 ? '🔈' : volume < 80 ? '🔉' : '🔊'}
                    </span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} style={{
                                width: '3px', height: '14px', borderRadius: '2px',
                                background: i < volume / 5 ? '#fff' : 'rgba(255,255,255,0.2)',
                            }} />
                        ))}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', minWidth: '2.5ch' }}>{volume}</span>
                </div>
            )}

            {keyFeedback && (
                (keyFeedback.kind === 'up' || keyFeedback.kind === 'down') ? (
                    <div style={{ position: 'fixed', bottom: '3rem', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 100, pointerEvents: 'none' }}>
                        <div key={keyFeedback.id} className={styles.keycap}>
                            {keyFeedback.kind === 'up' ? '↑' : '↓'}
                        </div>
                    </div>
                ) : (
                    <div
                        key={keyFeedback.id}
                        className={`${styles.keycap}${keyFeedback.empty ? ` ${styles.keycapEmpty}` : ''}`}
                        style={
                            keyFeedback.kind === 'left'
                                ? { position: 'fixed', left: '2.5rem', top: '50%', marginTop: '-1.375rem', zIndex: 100, pointerEvents: 'none' }
                                : keyFeedback.kind === 'right'
                                ? { position: 'fixed', right: '2.5rem', top: '50%', marginTop: '-1.375rem', zIndex: 100, pointerEvents: 'none' }
                                : { position: 'fixed', bottom: '3rem', left: `calc(${(keyFeedback.n! - 1) / 8} * (100% - 7rem) + 2.5rem)`, zIndex: 100, pointerEvents: 'none' }
                        }
                    >
                        {keyFeedback.kind === 'left' ? '←' : keyFeedback.kind === 'right' ? '→' : keyFeedback.n}
                    </div>
                )
            )}
        </div>
    );
}

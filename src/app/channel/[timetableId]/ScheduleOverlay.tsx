'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './schedule/ScheduleGrid.module.css';

interface SlotData {
    id: string;
    start: string;
    title: string;
    duration_seconds: number;
}

interface Props {
    timetableId: string;
    timetableTitle: string;
    onClose: () => void;
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function getLocalDayKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayHeader(iso: string): string {
    return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function ScheduleOverlay({ timetableId, timetableTitle, onClose }: Props) {
    const [slots, setSlots] = useState<SlotData[]>([]);
    const [loading, setLoading] = useState(true);
    const nowRef = useRef<HTMLDivElement>(null);
    const nowMs = Date.now();

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        const fetch = async () => {
            const supabase = createClient();
            const start = new Date();
            start.setUTCHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 7);

            const { data } = await supabase
                .from('timetable_slots')
                .select('id, scheduled_start_timestamp, videos(title, duration_seconds)')
                .eq('timetable_id', timetableId)
                .gte('scheduled_start_timestamp', start.toISOString())
                .lt('scheduled_start_timestamp', end.toISOString())
                .order('scheduled_start_timestamp', { ascending: true });

            const normalized: SlotData[] = (data ?? []).map((s) => {
                const v = Array.isArray(s.videos) ? s.videos[0] : s.videos;
                return {
                    id: s.id,
                    start: s.scheduled_start_timestamp,
                    title: v?.title ?? '(Unknown)',
                    duration_seconds: v?.duration_seconds ?? 0,
                };
            });
            setSlots(normalized);
            setLoading(false);
        };
        fetch();
    }, [timetableId]);

    useEffect(() => {
        if (!loading) {
            nowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }, [loading]);

    const handleDelete = async (slotId: string) => {
        const prev = slots;
        setSlots(s => s.filter(s => s.id !== slotId));
        try {
            const supabase = createClient();
            const { error } = await supabase.from('timetable_slots').delete().eq('id', slotId);
            if (error) throw error;
        } catch {
            setSlots(prev);
        }
    };

    const grouped = new Map<string, SlotData[]>();
    for (const slot of slots) {
        const key = getLocalDayKey(slot.start);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(slot);
    }
    const days = Array.from(grouped.entries());

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'inherit' }}>
            {/* Backdrop */}
            <div
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.82)' }}
                onClick={onClose}
            />

            {/* Panel */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{timetableTitle}</span>
                        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>7-Day Schedule</span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex', alignItems: 'center' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Grid */}
                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3, fontSize: '0.85rem' }}>
                        Loading…
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, calc(100vw / 3))`,
                        flex: 1,
                        minHeight: 0,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                    }}>
                        {days.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.25, fontSize: '0.85rem' }}>
                                No schedule for this period.
                            </div>
                        ) : days.map(([dayKey, daySlots], colIdx) => (
                            <div
                                key={dayKey}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderRight: colIdx < days.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ padding: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, backgroundColor: '#060606' }}>
                                    <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' }}>
                                        {formatDayHeader(daySlots[0].start)}
                                    </p>
                                </div>
                                <div className={styles.daySlots}>
                                    {daySlots.map((slot) => {
                                        const slotStartMs = new Date(slot.start).getTime();
                                        const slotEndMs = slotStartMs + slot.duration_seconds * 1000;
                                        const isNow = slotStartMs <= nowMs && nowMs < slotEndMs;
                                        const isPast = slotEndMs <= nowMs;
                                        const cls = [styles.slot, isNow ? styles.isNow : '', isPast && !isNow ? styles.isPast : ''].join(' ');

                                        return (
                                            <div key={slot.id} ref={isNow ? nowRef : undefined} className={cls}>
                                                <div className={styles.slotMeta}>
                                                    <span className={styles.slotTime}>{formatTime(slot.start)}</span>
                                                    {isNow && <span className={styles.nowBadge}>NOW</span>}
                                                    <span className={styles.slotDuration}>{formatDuration(slot.duration_seconds)}</span>
                                                </div>
                                                <p className={styles.slotTitle}>{slot.title}</p>
                                                <button className={styles.trashBtn} onClick={() => handleDelete(slot.id)} title="Remove">
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

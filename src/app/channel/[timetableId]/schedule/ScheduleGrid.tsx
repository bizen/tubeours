'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './ScheduleGrid.module.css';

export interface SlotData {
    id: string;
    start: string;
    title: string;
    duration_seconds: number;
}

interface Props {
    slots: SlotData[];
    timetableId: string;
    timetableTitle: string;
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

export default function ScheduleGrid({ slots: initialSlots, timetableId, timetableTitle }: Props) {
    const [slots, setSlots] = useState<SlotData[]>(initialSlots);
    const nowRef = useRef<HTMLDivElement>(null);
    const nowMs = Date.now();

    useEffect(() => {
        nowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, []);

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

    // Group by local day
    const grouped = new Map<string, SlotData[]>();
    for (const slot of slots) {
        const key = getLocalDayKey(slot.start);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(slot);
    }
    const days = Array.from(grouped.entries());

    return (
        <div style={{ backgroundColor: '#000', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'inherit' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/dashboard" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>← Dashboard</Link>
                    <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{timetableTitle}</span>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>7-Day Schedule</span>
                </div>
                <Link
                    href={`/channel/${timetableId}`}
                    style={{ padding: '0.4rem 1rem', backgroundColor: '#A9FF1C', color: '#000', borderRadius: '3px', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 700 }}
                >
                    ▶ Watch
                </Link>
            </div>

            {/* Grid */}
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
                        {/* Day header */}
                        <div style={{ padding: '0.85rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, backgroundColor: '#060606' }}>
                            <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' }}>
                                {formatDayHeader(daySlots[0].start)}
                            </p>
                        </div>

                        {/* Slots */}
                        <div className={styles.daySlots}>
                            {daySlots.map((slot) => {
                                const slotStartMs = new Date(slot.start).getTime();
                                const slotEndMs = slotStartMs + slot.duration_seconds * 1000;
                                const isNow = slotStartMs <= nowMs && nowMs < slotEndMs;
                                const isPast = slotEndMs <= nowMs;

                                const cls = [
                                    styles.slot,
                                    isNow ? styles.isNow : '',
                                    isPast && !isNow ? styles.isPast : '',
                                ].join(' ');

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
        </div>
    );
}

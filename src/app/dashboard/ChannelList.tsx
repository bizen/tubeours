'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, Pencil, Link2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './ChannelList.module.css';
import type { SlotInfo, NextSlotInfo } from './page';

const MAX_CHANNELS = 9;

interface Timetable {
    id: string;
    title: string;
    description: string | null;
    is_public: boolean;
    timetable_slots: { count: number }[];
}

interface Props {
    timetables: Timetable[];
    currentSlots: Record<string, SlotInfo>;
    nextSlots: Record<string, NextSlotInfo>;
    onOpenSchedule?: (timetableId: string, timetableTitle: string) => void;
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChannelList({ timetables: initial, currentSlots, nextSlots, onOpenSchedule }: Props) {
    const [timetables, setTimetables] = useState<Timetable[]>(initial);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleShare = (id: string) => {
        const url = `${window.location.origin}/channel/${id}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDelete = async (id: string) => {
        const prev = timetables;
        setTimetables(t => t.filter(t => t.id !== id));
        setConfirmingId(null);
        try {
            const supabase = createClient();
            await supabase.from('timetable_slots').delete().eq('timetable_id', id);
            const { error } = await supabase.from('timetables').delete().eq('id', id);
            if (error) throw error;
        } catch {
            setTimetables(prev);
        }
    };

    return (
        <div className={styles.grid}>
            {Array.from({ length: MAX_CHANNELS }).map((_, i) => {
                const t = timetables[i];
                const num = String(i + 1).padStart(2, '0');
                const isConfirming = t && confirmingId === t.id;

                if (t) {
                    return (
                        <div
                            key={t.id}
                            className={styles.card}
                            onMouseLeave={() => { if (confirmingId === t.id) setConfirmingId(null); }}
                        >
                            <span className={styles.num}>{num}</span>

                            <div className={styles.body}>
                                <p className={styles.title}>{t.title}</p>
                                <p className={styles.desc}>{t.description ?? ''}</p>
                                {(currentSlots[t.id] || nextSlots[t.id]) && (
                                    <div className={styles.scheduleInfo}>
                                        {currentSlots[t.id] && (
                                            <div className={styles.nowPlaying}>
                                                <span className={styles.nowDot} />
                                                <span className={styles.nowTitle}>{currentSlots[t.id].title}</span>
                                            </div>
                                        )}
                                        {nextSlots[t.id] && (
                                            <p className={styles.nextUp}>
                                                {formatTime(nextSlots[t.id].time)} · {nextSlots[t.id].title}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <div className={styles.footer}>
                                    <span className={styles.count}>{t.timetable_slots[0]?.count || 0} videos</span>
                                    {t.is_public && <span className={styles.badge}>Public</span>}
                                    {onOpenSchedule ? (
                                        <button className={styles.linkSchedule} onClick={() => onOpenSchedule(t.id, t.title)}>Schedule</button>
                                    ) : (
                                        <Link href={`/channel/${t.id}/schedule`} className={styles.linkSchedule}>Schedule</Link>
                                    )}
                                    <Link href={`/channel/${t.id}`} className={styles.linkWatch}>Watch →</Link>
                                </div>
                            </div>

                            {/* Share button (only when public) */}
                            {t.is_public && (
                                <button
                                    className={`${styles.shareBtn} ${copiedId === t.id ? styles.shareBtnCopied : ''}`}
                                    onClick={() => handleShare(t.id)}
                                    title="Copy link"
                                >
                                    <Link2 size={12} />
                                </button>
                            )}

                            {/* Edit button */}
                            <Link href={`/dashboard/edit/${t.id}`} className={styles.editBtn} title="Edit channel">
                                <Pencil size={12} />
                            </Link>

                            {/* Delete button */}
                            <button
                                className={styles.trashBtn}
                                onClick={() => setConfirmingId(t.id)}
                                title="Delete channel"
                            >
                                <Trash2 size={12} />
                            </button>

                            {/* Confirm overlay */}
                            {isConfirming && (
                                <div className={styles.confirmOverlay}>
                                    <p className={styles.confirmText}>Delete &ldquo;{t.title}&rdquo;?<br />This cannot be undone.</p>
                                    <div className={styles.confirmBtns}>
                                        <button className={styles.cancelBtn} onClick={() => setConfirmingId(null)}>Cancel</button>
                                        <button className={styles.deleteBtn} onClick={() => handleDelete(t.id)}>Delete</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }

                // Empty slot
                return (
                    <div key={`empty-${i}`} className={styles.empty}>
                        <span className={styles.numEmpty}>{num}</span>
                        {i === timetables.length && timetables.length < MAX_CHANNELS && (
                            <Link href="/dashboard/create" className={styles.createLink} title="New channel">+</Link>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

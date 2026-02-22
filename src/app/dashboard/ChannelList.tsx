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
    followedTimetables?: Timetable[];
    followedIds?: Set<string>;
    currentSlots: Record<string, SlotInfo>;
    nextSlots: Record<string, NextSlotInfo>;
    followerCounts?: Record<string, number>;
    onOpenSchedule?: (timetableId: string, timetableTitle: string) => void;
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChannelList({ timetables: initial, followedTimetables: initialFollowed = [], followedIds, currentSlots, nextSlots, followerCounts = {}, onOpenSchedule }: Props) {
    const [timetables, setTimetables] = useState<Timetable[]>(initial);
    const [followed, setFollowed] = useState<Timetable[]>(initialFollowed);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleUnfollow = async (id: string) => {
        setFollowed(f => f.filter(t => t.id !== id));
        const supabase = createClient();
        await supabase.from('channel_follows').delete().eq('timetable_id', id);
    };

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
        <>
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
                                <span className={styles.count}>{t.timetable_slots[0]?.count || 0} videos</span>
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
                                    {t.is_public && <span className={styles.badge}>Public</span>}
                                    {t.is_public && (followerCounts[t.id] ?? 0) > 0 && (
                                        <span className={styles.followerCount}>👀 {followerCounts[t.id]}</span>
                                    )}
                                    <span className={styles.footerSpacer} />
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

        {followed.length > 0 && (
            <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                <p style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: '0.5rem' }}>
                    Following
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {followed.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 0.6rem', borderRadius: '4px', background: '#0a0a0a' }}>
                            <Link href={`/channel/${t.id}`} style={{ flex: 1, textDecoration: 'none', color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.title}
                            </Link>
                            {currentSlots[t.id] && (
                                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '12rem', flexShrink: 0 }}>
                                    {currentSlots[t.id].title}
                                </span>
                            )}
                            <button
                                onClick={() => handleUnfollow(t.id)}
                                title="Unfollow"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.18)', padding: '0.15rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,80,80,0.7)'; }}
                                onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.18)'; }}
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}
        </>
    );
}

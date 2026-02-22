'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import ChannelList from '@/app/dashboard/ChannelList';
import type { SlotInfo, NextSlotInfo } from '@/app/dashboard/page';

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
    onClose: () => void;
    onOpenSchedule?: (timetableId: string, timetableTitle: string) => void;
}

const MAX_CHANNELS = 9;

export default function DashboardOverlay({ timetables, currentSlots, nextSlots, onClose, onOpenSchedule }: Props) {
    const atLimit = timetables.length >= MAX_CHANNELS;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'inherit' }}>
            {/* Backdrop — click to close */}
            <div
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)' }}
                onClick={onClose}
            />

            {/* Panel */}
            <div style={{
                position: 'relative',
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                maxWidth: '900px',
                width: '100%',
                margin: '0 auto',
                padding: '1.5rem 2.5rem',
            }}>
                {/* Header */}
                <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h1 style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                        Your Channels
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        {atLimit ? (
                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)' }}>9 / 9</span>
                        ) : (
                            <Link href="/dashboard/create" style={{ fontSize: '0.78rem', color: '#A9FF1C', textDecoration: 'none', fontWeight: 500 }}>
                                + New Channel
                            </Link>
                        )}
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex', alignItems: 'center' }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Grid */}
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ChannelList
                        timetables={timetables}
                        currentSlots={currentSlots}
                        nextSlots={nextSlots}
                        onOpenSchedule={onOpenSchedule}
                    />
                </div>
            </div>
        </div>
    );
}

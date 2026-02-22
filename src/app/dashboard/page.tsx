import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ChannelList from './ChannelList';

const MAX_CHANNELS = 9;

export interface SlotInfo {
    title: string;
}

export interface NextSlotInfo {
    title: string;
    time: string;
}

export default async function Dashboard() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return redirect('/login');

    const { data: timetables } = await supabase
        .from('timetables')
        .select('*, timetable_slots(count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(MAX_CHANNELS);

    const ids = (timetables ?? []).map(t => t.id);
    let currentSlots: Record<string, SlotInfo> = {};
    let nextSlots: Record<string, NextSlotInfo> = {};

    if (ids.length > 0) {
        const now = new Date().toISOString();
        const [{ data: past }, { data: future }] = await Promise.all([
            supabase
                .from('timetable_slots')
                .select('timetable_id, scheduled_start_timestamp, videos(title)')
                .in('timetable_id', ids)
                .lte('scheduled_start_timestamp', now)
                .order('scheduled_start_timestamp', { ascending: false })
                .limit(50),
            supabase
                .from('timetable_slots')
                .select('timetable_id, scheduled_start_timestamp, videos(title)')
                .in('timetable_id', ids)
                .gt('scheduled_start_timestamp', now)
                .order('scheduled_start_timestamp', { ascending: true })
                .limit(50),
        ]);

        for (const slot of past ?? []) {
            if (!currentSlots[slot.timetable_id]) {
                const v = Array.isArray(slot.videos) ? slot.videos[0] : slot.videos;
                if (v?.title) currentSlots[slot.timetable_id] = { title: v.title };
            }
        }
        for (const slot of future ?? []) {
            if (!nextSlots[slot.timetable_id]) {
                const v = Array.isArray(slot.videos) ? slot.videos[0] : slot.videos;
                if (v?.title) nextSlots[slot.timetable_id] = { title: v.title, time: slot.scheduled_start_timestamp };
            }
        }
    }

    const count = timetables?.length ?? 0;
    const atLimit = count >= MAX_CHANNELS;

    return (
        <div style={{ backgroundColor: '#000', height: '100vh', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'inherit', overflow: 'hidden' }}>
            {/* Top bar */}
            <div style={{ flexShrink: 0, padding: '1.25rem 2.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.04em' }}>tubeours</span>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, maxWidth: '900px', width: '100%', margin: '0 auto', padding: '1.5rem 2.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
                    <h1 style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                        Your Channels
                    </h1>
                    {atLimit ? (
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)' }}>9 / 9</span>
                    ) : (
                        <Link href="/dashboard/create" style={{ fontSize: '0.78rem', color: '#A9FF1C', textDecoration: 'none', fontWeight: 500 }}>
                            + New Channel
                        </Link>
                    )}
                </div>

                <div style={{ flex: 1, minHeight: 0 }}>
                    <ChannelList timetables={timetables ?? []} currentSlots={currentSlots} nextSlots={nextSlots} />
                </div>
            </div>
        </div>
    );
}

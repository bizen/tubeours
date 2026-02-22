import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ChannelViewer from './ChannelViewer';

interface PageProps {
    params: Promise<{ timetableId: string }>;
    searchParams: Promise<Record<string, string>>;
}

export default async function ChannelPage({ params, searchParams }: PageProps) {
    const { timetableId } = await params;
    const { autoplay } = await searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    // Fetch current timetable + all user timetables (keyboard nav + overlay)
    const [{ data: timetable }, { data: allTimetables }] = await Promise.all([
        supabase
            .from('timetables')
            .select('id, title, source_type')
            .eq('id', timetableId)
            .single(),
        supabase
            .from('timetables')
            .select('*, timetable_slots(count)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(9),
    ]);

    if (!timetable) notFound();

    const now = new Date().toISOString();

    // AI channels: check if future slots are running low and trigger background refill
    if (timetable.source_type === 'ai') {
        const sixHoursLater = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
            .from('timetable_slots')
            .select('id', { count: 'exact', head: true })
            .eq('timetable_id', timetableId)
            .gt('scheduled_start_timestamp', now)
            .lt('scheduled_start_timestamp', sixHoursLater);

        if ((count ?? 0) < 5) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
            fetch(`${siteUrl}/api/curate/ai/refill`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': process.env.INTERNAL_REFILL_SECRET ?? '',
                },
                body: JSON.stringify({ timetableId }),
            }).catch(() => {});
        }
    }
    const channelIds = (allTimetables ?? []).map(c => c.id);
    const currentIndex = channelIds.indexOf(timetableId);
    const displayMode = (user.user_metadata?.display_mode ?? 'fill') as 'fill' | 'fit';

    // Current slot for this channel
    const { data: currentSlot } = await supabase
        .from('timetable_slots')
        .select('id, scheduled_start_timestamp, videos(youtube_video_id, title)')
        .eq('timetable_id', timetableId)
        .lte('scheduled_start_timestamp', now)
        .order('scheduled_start_timestamp', { ascending: false })
        .limit(1)
        .single();

    // Current/next slots for all channels (overlay dashboard)
    const overlayCurrentSlots: Record<string, { title: string }> = {};
    const overlayNextSlots: Record<string, { title: string; time: string }> = {};

    if (channelIds.length > 0) {
        const [{ data: past }, { data: future }] = await Promise.all([
            supabase
                .from('timetable_slots')
                .select('timetable_id, scheduled_start_timestamp, videos(title)')
                .in('timetable_id', channelIds)
                .lte('scheduled_start_timestamp', now)
                .order('scheduled_start_timestamp', { ascending: false })
                .limit(50),
            supabase
                .from('timetable_slots')
                .select('timetable_id, scheduled_start_timestamp, videos(title)')
                .in('timetable_id', channelIds)
                .gt('scheduled_start_timestamp', now)
                .order('scheduled_start_timestamp', { ascending: true })
                .limit(50),
        ]);

        for (const slot of past ?? []) {
            if (!overlayCurrentSlots[slot.timetable_id]) {
                const v = Array.isArray(slot.videos) ? slot.videos[0] : slot.videos;
                if (v?.title) overlayCurrentSlots[slot.timetable_id] = { title: v.title };
            }
        }
        for (const slot of future ?? []) {
            if (!overlayNextSlots[slot.timetable_id]) {
                const v = Array.isArray(slot.videos) ? slot.videos[0] : slot.videos;
                if (v?.title) overlayNextSlots[slot.timetable_id] = { title: v.title, time: slot.scheduled_start_timestamp };
            }
        }
    }

    return (
        <ChannelViewer
            timetableId={timetableId}
            timetableTitle={timetable.title}
            initialSlot={currentSlot ?? null}
            channelIds={channelIds}
            currentIndex={currentIndex}
            autoplay={autoplay === '1'}
            displayMode={displayMode}
            overlayTimetables={allTimetables ?? []}
            overlayCurrentSlots={overlayCurrentSlots}
            overlayNextSlots={overlayNextSlots}
        />
    );
}

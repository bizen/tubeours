import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ScheduleGrid, { type SlotData } from './ScheduleGrid';

interface PageProps {
    params: Promise<{ timetableId: string }>;
}

export default async function SchedulePage({ params }: PageProps) {
    const { timetableId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    const { data: timetable } = await supabase
        .from('timetables')
        .select('id, title')
        .eq('id', timetableId)
        .single();

    if (!timetable) notFound();

    // Fetch 7 days of slots from UTC midnight today
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);

    const { data: rawSlots } = await supabase
        .from('timetable_slots')
        .select('id, scheduled_start_timestamp, videos(title, duration_seconds)')
        .eq('timetable_id', timetableId)
        .gte('scheduled_start_timestamp', start.toISOString())
        .lt('scheduled_start_timestamp', end.toISOString())
        .order('scheduled_start_timestamp', { ascending: true });

    // Normalize the videos join (Supabase can return array or object)
    const slots: SlotData[] = (rawSlots ?? []).map((s) => {
        const v = Array.isArray(s.videos) ? s.videos[0] : s.videos;
        return {
            id: s.id,
            start: s.scheduled_start_timestamp,
            title: v?.title ?? '(Unknown)',
            duration_seconds: v?.duration_seconds ?? 0,
        };
    });

    return (
        <ScheduleGrid
            slots={slots}
            timetableId={timetableId}
            timetableTitle={timetable.title}
        />
    );
}

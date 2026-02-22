import { addSeconds } from 'date-fns';

interface DbVideo {
    id: string;             // DB UUID (video_id FK)
    duration_seconds: number;
}

/**
 * Generates timetable_slots rows for a continuous 7-day schedule.
 * Videos are looped in order. No DB calls — caller handles inserts.
 */
export function generateSlotsForVideos(
    timetableId: string,
    dbVideos: DbVideo[],
    startFrom: Date,
    daysToGenerate: number = 7,
): Array<{ timetable_id: string; video_id: string; scheduled_start_timestamp: string }> {
    const playable = dbVideos.filter(v => v.duration_seconds > 0);
    if (playable.length === 0) throw new Error('No playable videos to schedule');

    const slots = [];
    let current = new Date(startFrom);
    const targetEnd = addSeconds(startFrom, daysToGenerate * 24 * 60 * 60);
    let idx = 0;

    while (current < targetEnd) {
        const video = playable[idx % playable.length];
        slots.push({
            timetable_id: timetableId,
            video_id: video.id,
            scheduled_start_timestamp: current.toISOString(),
        });
        current = addSeconds(current, video.duration_seconds);
        idx++;
    }

    return slots;
}

/**
 * Inserts slots in batches of 1000 to respect Supabase payload limits.
 */
export async function insertSlotsInBatches(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    slots: Array<{ timetable_id: string; video_id: string; scheduled_start_timestamp: string }>,
) {
    for (let i = 0; i < slots.length; i += 1000) {
        const { error } = await supabase.from('timetable_slots').insert(slots.slice(i, i + 1000));
        if (error) throw error;
    }
}

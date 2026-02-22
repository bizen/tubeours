import { NextResponse } from 'next/server';
import { addSeconds } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { searchYouTubeVideos } from '@/lib/youtube/api';
import { generateSlotsForVideos, insertSlotsInBatches } from '@/lib/schedule';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { timetableId } = body;

        if (!timetableId) {
            return NextResponse.json({ error: 'timetableId is required' }, { status: 400 });
        }

        // Auth: accept either an internal server-to-server call (secret header)
        // or a regular authenticated user request.
        const internalSecret = request.headers.get('x-internal-secret');
        const isInternal = internalSecret && internalSecret === process.env.INTERNAL_REFILL_SECRET;

        const supabase = await createClient();

        if (!isInternal) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

            const { data: ownership } = await supabase
                .from('timetables')
                .select('id')
                .eq('id', timetableId)
                .eq('user_id', user.id)
                .single();
            if (!ownership) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        // 1. Load AI channel config
        const { data: config, error: configErr } = await supabase
            .from('ai_channel_configs')
            .select('search_queries, current_query_index, next_page_tokens')
            .eq('timetable_id', timetableId)
            .single();

        if (configErr || !config) {
            return NextResponse.json({ error: 'Not an AI channel' }, { status: 400 });
        }

        const searchQueries = config.search_queries as string[];
        const tokens = config.next_page_tokens as Record<string, string | null>;
        let queryIdx = config.current_query_index;

        // Determine which query + pageToken to use
        let pageToken: string | null | undefined = tokens[String(queryIdx)];

        // If current query's pages are exhausted (explicitly null), rotate to next
        if (pageToken === null) {
            queryIdx = (queryIdx + 1) % searchQueries.length;
            pageToken = tokens[String(queryIdx)] ?? undefined; // undefined = fresh search
        }

        // 2. Search YouTube (100 quota units)
        const { videos, nextPageToken } = await searchYouTubeVideos(
            searchQueries[queryIdx],
            pageToken ?? undefined,
        );

        if (videos.length === 0) {
            // Nothing found — update query rotation and return gracefully
            const updatedTokens = { ...tokens, [String(queryIdx)]: null };
            await supabase
                .from('ai_channel_configs')
                .update({ next_page_tokens: updatedTokens, current_query_index: queryIdx })
                .eq('timetable_id', timetableId);
            return NextResponse.json({ ok: true, added: 0 });
        }

        // 3. Save updated pagination state
        const updatedTokens = { ...tokens, [String(queryIdx)]: nextPageToken };
        await supabase
            .from('ai_channel_configs')
            .update({
                current_query_index: queryIdx,
                next_page_tokens: updatedTokens,
                last_refill_at: new Date().toISOString(),
            })
            .eq('timetable_id', timetableId);

        // 4. Cache videos
        const videosToInsert = videos.map(v => ({
            youtube_video_id: v.id,
            title: v.title,
            channel_title: v.channelTitle,
            duration_seconds: v.durationSeconds,
            thumbnail_url: v.thumbnailUrl,
        }));
        await supabase
            .from('videos')
            .upsert(videosToInsert, { onConflict: 'youtube_video_id', ignoreDuplicates: true });

        const ytIds = videos.map(v => v.id);
        const { data: dbVideos, error: dbErr } = await supabase
            .from('videos')
            .select('id, duration_seconds')
            .in('youtube_video_id', ytIds);
        if (dbErr || !dbVideos) throw new Error('Could not map videos to DB records');

        // 5. Find last slot to determine where to continue the schedule
        const { data: lastSlot } = await supabase
            .from('timetable_slots')
            .select('scheduled_start_timestamp, videos(duration_seconds)')
            .eq('timetable_id', timetableId)
            .order('scheduled_start_timestamp', { ascending: false })
            .limit(1)
            .single();

        let startFrom: Date;
        if (lastSlot) {
            const lastVideo = Array.isArray(lastSlot.videos) ? lastSlot.videos[0] : lastSlot.videos;
            const lastEnd = addSeconds(
                new Date(lastSlot.scheduled_start_timestamp),
                lastVideo?.duration_seconds ?? 0,
            );
            // If last slot is already in the past, start from now
            startFrom = lastEnd > new Date() ? lastEnd : new Date();
        } else {
            startFrom = new Date();
        }

        // 6. Generate and insert new slots
        const slots = generateSlotsForVideos(timetableId, dbVideos, startFrom);
        await insertSlotsInBatches(supabase, slots);

        return NextResponse.json({ ok: true, added: slots.length });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Refill Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

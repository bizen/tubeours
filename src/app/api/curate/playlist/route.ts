import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    fetchYouTubePlaylistVideos,
    extractYouTubePlaylistId,
    extractYouTubeChannelIdentifier,
    resolveChannelToUploadsPlaylistId,
} from '@/lib/youtube/api';
// We'll use date-fns to handle the offset logic easily
import { addSeconds } from 'date-fns';

// Resolve a raw YouTube URL (playlist or channel) to a playlist ID.
async function resolveSourceUrl(sourceUrl: string): Promise<{ playlistId: string | null; error?: string }> {
    const playlistId = extractYouTubePlaylistId(sourceUrl);
    if (playlistId) return { playlistId };

    const channelIdentifier = extractYouTubeChannelIdentifier(sourceUrl);
    if (channelIdentifier) {
        const uploadsPlaylistId = await resolveChannelToUploadsPlaylistId(channelIdentifier);
        if (uploadsPlaylistId) return { playlistId: uploadsPlaylistId };
        return { playlistId: null, error: 'Could not find this YouTube channel. Check the URL and try again.' };
    }

    return { playlistId: null, error: 'Not a valid YouTube playlist or channel URL.' };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, description, isPublic, sourceUrl } = body;

        if (!title || !sourceUrl) {
            return NextResponse.json({ error: 'Title and source URL are required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Resolve URL to a playlist ID (handles both playlist and channel URLs)
        const { playlistId, error: resolveError } = await resolveSourceUrl(sourceUrl);
        if (!playlistId) {
            return NextResponse.json({ error: resolveError }, { status: 400 });
        }

        // 2. Fetch videos from YouTube
        const videos = await fetchYouTubePlaylistVideos(playlistId);

        if (videos.length === 0) {
            return NextResponse.json({ error: 'No playable videos found. The playlist or channel may be empty or private.' }, { status: 400 });
        }

        // 2. Cache videos in our 'videos' table (upsert logic to ignore conflicts)
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

        // Retrieve the DB UUIDs for the videos we just upserted/selected
        // (Since upserting doesn't easily return all row IDs if some already existed, we query them back)
        const ytVideoIds = videos.map(v => v.id);
        const { data: dbVideos, error: dbVideosError } = await supabase
            .from('videos')
            .select('id, youtube_video_id, duration_seconds')
            .in('youtube_video_id', ytVideoIds);

        if (dbVideosError || !dbVideos) {
            throw new Error('Could not map videos to DB records');
        }

        // 3. Create the Timetable (Auto-generated flag)
        const { data: timetable, error: ttError } = await supabase
            .from('timetables')
            .insert({
                user_id: user.id,
                title,
                description,
                is_public: isPublic,
                is_auto_generated: true,
                source_type: 'playlist',
                source_id: playlistId,
                last_generated_at: new Date().toISOString(),
                // In Phase 2, we schedule next generation to be 1 week from now
            })
            .select()
            .single();

        if (ttError) throw ttError;

        // 4. Generate Timeslots back-to-back starting from NOW for the week
        const slotsToInsert = [];
        let currentTimestamp = new Date();

        // Loop heavily to create a 24/7 channel loop for 7 days
        const daysToGenerate = 7;
        const targetEndTime = addSeconds(new Date(), daysToGenerate * 24 * 60 * 60);

        let videoRefIndex = 0;
        let consecutiveMissing = 0;

        while (currentTimestamp < targetEndTime) {
            // Get the next video in the fetched playlist (looping)
            const videoData = videos[videoRefIndex % videos.length];
            const dbRef = dbVideos.find(dbv => dbv.youtube_video_id === videoData.id);

            if (dbRef && dbRef.duration_seconds > 0) {
                slotsToInsert.push({
                    timetable_id: timetable.id,
                    video_id: dbRef.id,
                    scheduled_start_timestamp: currentTimestamp.toISOString(),
                });

                // Add the duration to the current timestamp for the next video
                currentTimestamp = addSeconds(currentTimestamp, dbRef.duration_seconds);
                consecutiveMissing = 0;
            } else {
                consecutiveMissing++;
                if (consecutiveMissing > videos.length) {
                    throw new Error("Cannot save videos to database. Please make sure the INSERT policy for videos is configured in Supabase.");
                }
            }

            videoRefIndex++;
        }

        // Insert in batches of 1000 to prevent Supabase payload limits
        for (let i = 0; i < slotsToInsert.length; i += 1000) {
            const batch = slotsToInsert.slice(i, i + 1000);
            const { error: batchError } = await supabase.from('timetable_slots').insert(batch);
            if (batchError) throw batchError;
        }

        return NextResponse.json({ data: timetable });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Generation Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { timetableId, title, description, isPublic, sourceUrl } = body;

        if (!timetableId || !title) {
            return NextResponse.json({ error: 'Timetable ID and title are required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Resolve new source URL to playlist ID if provided
        let resolvedPlaylistId: string | null = null;
        if (sourceUrl) {
            const { playlistId, error: resolveError } = await resolveSourceUrl(sourceUrl);
            if (!playlistId) {
                return NextResponse.json({ error: resolveError }, { status: 400 });
            }
            resolvedPlaylistId = playlistId;
        }

        // Update timetable metadata
        const { error: updateError } = await supabase
            .from('timetables')
            .update({
                title,
                description,
                is_public: isPublic,
                ...(resolvedPlaylistId ? { source_id: resolvedPlaylistId, last_generated_at: new Date().toISOString() } : {}),
            })
            .eq('id', timetableId)
            .eq('user_id', user.id);

        if (updateError) throw updateError;

        // If source changed, delete old slots and regenerate
        if (resolvedPlaylistId) {
            await supabase.from('timetable_slots').delete().eq('timetable_id', timetableId);

            const videos = await fetchYouTubePlaylistVideos(resolvedPlaylistId);
            if (videos.length === 0) {
                return NextResponse.json({ error: 'No playable videos found. The playlist or channel may be empty or private.' }, { status: 400 });
            }

            const videosToInsert = videos.map(v => ({
                youtube_video_id: v.id,
                title: v.title,
                channel_title: v.channelTitle,
                duration_seconds: v.durationSeconds,
                thumbnail_url: v.thumbnailUrl,
            }));

            await supabase.from('videos').upsert(videosToInsert, { onConflict: 'youtube_video_id', ignoreDuplicates: true });

            const ytVideoIds = videos.map(v => v.id);
            const { data: dbVideos } = await supabase
                .from('videos')
                .select('id, youtube_video_id, duration_seconds')
                .in('youtube_video_id', ytVideoIds);

            if (!dbVideos) throw new Error('Could not map videos to DB records');

            const slotsToInsert = [];
            let currentTimestamp = new Date();
            const targetEndTime = addSeconds(new Date(), 7 * 24 * 60 * 60);
            let videoRefIndex = 0;
            let consecutiveMissing = 0;

            while (currentTimestamp < targetEndTime) {
                const videoData = videos[videoRefIndex % videos.length];
                const dbRef = dbVideos.find(dbv => dbv.youtube_video_id === videoData.id);

                if (dbRef && dbRef.duration_seconds > 0) {
                    slotsToInsert.push({
                        timetable_id: timetableId,
                        video_id: dbRef.id,
                        scheduled_start_timestamp: currentTimestamp.toISOString(),
                    });
                    currentTimestamp = addSeconds(currentTimestamp, dbRef.duration_seconds);
                    consecutiveMissing = 0;
                } else {
                    consecutiveMissing++;
                    if (consecutiveMissing > videos.length) throw new Error('Cannot save videos to database');
                }
                videoRefIndex++;
            }

            for (let i = 0; i < slotsToInsert.length; i += 1000) {
                const batch = slotsToInsert.slice(i, i + 1000);
                const { error: batchError } = await supabase.from('timetable_slots').insert(batch);
                if (batchError) throw batchError;
            }
        }

        return NextResponse.json({ success: true });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Edit Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

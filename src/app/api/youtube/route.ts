import { NextResponse } from 'next/server';
import { fetchYouTubeVideoInfo } from '@/lib/youtube/api';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('id');

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Check auth implicitly before interacting with DB
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Check if the video already exists in our cache DB to save YouTube API quota
        const { data: existingVideo } = await supabase
            .from('videos')
            .select('*')
            .eq('youtube_video_id', videoId)
            .single();

        if (existingVideo) {
            return NextResponse.json({ data: existingVideo });
        }

        // If not, fetch it from YouTube Data API
        const ytData = await fetchYouTubeVideoInfo(videoId);

        if (!ytData) {
            return NextResponse.json({ error: 'Could not fetch video data' }, { status: 404 });
        }

        // Save to our DB cache
        const { data: newVideo, error } = await supabase
            .from('videos')
            .insert([
                {
                    youtube_video_id: ytData.id,
                    title: ytData.title,
                    channel_title: ytData.channelTitle,
                    duration_seconds: ytData.durationSeconds,
                    thumbnail_url: ytData.thumbnailUrl,
                }
            ])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ data: newVideo });

    } catch (error) {
        console.error('Error in YouTube proxy route:', error);
        return NextResponse.json({ error: 'Server errror' }, { status: 500 });
    }
}

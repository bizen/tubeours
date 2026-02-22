import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { searchYouTubeVideos } from '@/lib/youtube/api';
import { generateSlotsForVideos, insertSlotsInBatches } from '@/lib/schedule';

// ─────────────────────────────────────────────────────────────────────────────
// System prompt for query generation
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a creative curator for an AI-powered YouTube TV channel. Given a theme from the user, generate 5 to 8 diverse YouTube search queries that will surface engaging, high-quality videos related to that theme.

Rules:
- Explore a "gradient of context": cover different facets, moods, and angles of the theme — not just synonyms or exact repetitions
- Always include at least 2–3 English queries regardless of the input language, since YouTube has far more English content
- Think beyond the literal: include adjacent topics, atmospheric content, and contextually related material
- Be specific and creative — generic queries like "music playlist" or "best videos" are forbidden
- Output ONLY a valid JSON array of strings, with no explanation, markdown, or extra text

Example — Theme: "Lo-Fi HipHop"
["lo-fi hip hop beats to study", "lofi girl playlist 2024", "深夜 作業用BGM チル", "tokyo night walk aesthetic 4k", "rainy cafe ambience jazz", "chill beats concentration music", "vaporwave city drive night"]

Example — Theme: "三島由紀夫"
["三島由紀夫 スピーチ 講演", "Yukio Mishima documentary English", "三島由紀夫 市ヶ谷 演説 1970", "Mishima A Life in Four Chapters", "三島由紀夫 インタビュー 日本", "Yukio Mishima last speech subtitles"]`;

// ─────────────────────────────────────────────────────────────────────────────
// POST — Create AI channel
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, description, isPublic, theme } = body;

        if (!title || !theme) {
            return NextResponse.json({ error: 'Title and theme are required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Call Claude Haiku to generate search queries
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `Theme: "${theme}"` }],
        });

        let searchQueries: string[];
        try {
            const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
            const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            const match = stripped.match(/\[[\s\S]*\]/);
            searchQueries = JSON.parse(match ? match[0] : stripped);
            if (!Array.isArray(searchQueries) || searchQueries.length === 0) throw new Error();
        } catch {
            return NextResponse.json(
                { error: 'AI failed to generate search queries. Please try again.' },
                { status: 500 },
            );
        }

        // 2. Search YouTube with the first query (100 quota units)
        const { videos, nextPageToken } = await searchYouTubeVideos(searchQueries[0]);
        if (videos.length === 0) {
            return NextResponse.json(
                { error: 'No videos found for this theme. Please try a different description.' },
                { status: 400 },
            );
        }

        // 3. Create the timetable record
        const { data: timetable, error: ttError } = await supabase
            .from('timetables')
            .insert({
                user_id: user.id,
                title,
                description,
                is_public: isPublic,
                is_auto_generated: true,
                source_type: 'ai',
                last_generated_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (ttError) throw ttError;

        // 4. Save AI channel config (queries + first nextPageToken)
        const initialTokens: Record<string, string | null> = { '0': nextPageToken };
        const { error: configError } = await supabase.from('ai_channel_configs').insert({
            timetable_id: timetable.id,
            theme,
            search_queries: searchQueries,
            current_query_index: 0,
            next_page_tokens: initialTokens,
        });
        if (configError) throw configError;

        // 5. Cache videos in `videos` table
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

        // 6. Fetch back DB UUIDs
        const ytIds = videos.map(v => v.id);
        const { data: dbVideos, error: dbErr } = await supabase
            .from('videos')
            .select('id, duration_seconds')
            .in('youtube_video_id', ytIds);
        if (dbErr || !dbVideos) throw new Error('Could not map videos to DB records');

        // 7. Generate and insert 7-day schedule
        const slots = generateSlotsForVideos(timetable.id, dbVideos, new Date());
        await insertSlotsInBatches(supabase, slots);

        return NextResponse.json({ data: timetable });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('AI Channel Creation Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — Edit AI channel (title/desc/public or re-curate with new theme)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { timetableId, title, description, isPublic, theme } = body;

        if (!timetableId || !title) {
            return NextResponse.json({ error: 'Timetable ID and title are required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Verify ownership
        const { data: existing } = await supabase
            .from('timetables')
            .select('id, source_type')
            .eq('id', timetableId)
            .eq('user_id', user.id)
            .single();
        if (!existing) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

        // Update timetable metadata
        await supabase
            .from('timetables')
            .update({ title, description, is_public: isPublic })
            .eq('id', timetableId);

        // If theme changed, re-curate everything
        if (theme) {
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const message = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 256,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: `Theme: "${theme}"` }],
            });

            let searchQueries: string[];
            try {
                const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
                const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
                const match = stripped.match(/\[[\s\S]*\]/);
                searchQueries = JSON.parse(match ? match[0] : stripped);
                if (!Array.isArray(searchQueries) || searchQueries.length === 0) throw new Error();
            } catch {
                return NextResponse.json({ error: 'AI failed to regenerate queries.' }, { status: 500 });
            }

            const { videos, nextPageToken } = await searchYouTubeVideos(searchQueries[0]);
            if (videos.length === 0) {
                return NextResponse.json({ error: 'No videos found for this theme.' }, { status: 400 });
            }

            // Delete old slots + config, then rebuild
            await supabase.from('timetable_slots').delete().eq('timetable_id', timetableId);
            await supabase.from('ai_channel_configs').delete().eq('timetable_id', timetableId);

            const initialTokens: Record<string, string | null> = { '0': nextPageToken };
            await supabase.from('ai_channel_configs').insert({
                timetable_id: timetableId,
                theme,
                search_queries: searchQueries,
                current_query_index: 0,
                next_page_tokens: initialTokens,
            });

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
            const { data: dbVideos } = await supabase
                .from('videos')
                .select('id, duration_seconds')
                .in('youtube_video_id', ytIds);
            if (!dbVideos) throw new Error('Could not map videos');

            const slots = generateSlotsForVideos(timetableId, dbVideos, new Date());
            await insertSlotsInBatches(supabase, slots);

            await supabase
                .from('timetables')
                .update({ last_generated_at: new Date().toISOString() })
                .eq('id', timetableId);
        }

        return NextResponse.json({ success: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('AI Channel Edit Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

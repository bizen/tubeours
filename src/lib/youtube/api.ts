export interface YouTubeVideoData {
    id: string; // YouTube video ID (e.g. dQw4w9WgXcQ)
    title: string;
    channelTitle: string;
    duration: string; // ISO 8601 duration
    durationSeconds: number;
    thumbnailUrl: string;
}

export async function fetchYouTubeVideoInfo(videoId: string): Promise<YouTubeVideoData | null> {
    if (!process.env.NEXT_PUBLIC_YOUTUBE_API_KEY) {
        console.error('YouTube API Key is missing. Please add NEXT_PUBLIC_YOUTUBE_API_KEY to your .env.local file.');
        return null;
    }

    try {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`
        );

        if (!res.ok) {
            throw new Error(`YouTube API returned ${res.status}`);
        }

        const data = await res.json();

        if (!data.items || data.items.length === 0) {
            return null;
        }

        const video = data.items[0];

        // Parse ISO 8601 duration (e.g., PT1H2M10S) to seconds
        const durationISO = video.contentDetails.duration;
        const durationSeconds = parseYouTubeDuration(durationISO);

        return {
            id: video.id,
            title: video.snippet.title,
            channelTitle: video.snippet.channelTitle,
            duration: durationISO,
            durationSeconds,
            thumbnailUrl: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url || '',
        };
    } catch (error) {
        console.error('Error fetching YouTube data:', error);
        return null;
    }
}

// Helper to convert YouTube ISO duration format into seconds
function parseYouTubeDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
}

// Helper function to extract YouTube video ID from various URL formats
export function extractYouTubeId(url: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

// Extract Playlist ID from URL
export function extractYouTubePlaylistId(url: string): string | null {
    const regExp = /[?&]list=([^#&?]+)/;
    const match = url.match(regExp);
    return match ? match[1] : null;
}

// Channel identifier extracted from various YouTube channel URL formats
export interface YouTubeChannelIdentifier {
    type: 'id' | 'handle' | 'username' | 'custom';
    value: string;
}

// Extract channel identifier from YouTube channel URLs:
//   https://www.youtube.com/channel/UCxxxxxx
//   https://www.youtube.com/@handle
//   https://www.youtube.com/user/username  (legacy)
//   https://www.youtube.com/c/customname   (old custom URL)
export function extractYouTubeChannelIdentifier(url: string): YouTubeChannelIdentifier | null {
    const idMatch = url.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    if (idMatch) return { type: 'id', value: idMatch[1] };

    const handleMatch = url.match(/youtube\.com\/@([\w.-]+)/);
    if (handleMatch) return { type: 'handle', value: `@${handleMatch[1]}` };

    const userMatch = url.match(/youtube\.com\/user\/([\w.-]+)/);
    if (userMatch) return { type: 'username', value: userMatch[1] };

    const customMatch = url.match(/youtube\.com\/c\/([\w.-]+)/);
    if (customMatch) return { type: 'custom', value: customMatch[1] };

    return null;
}

// Resolve a channel identifier to its uploads playlist ID via the YouTube channels API (1 quota unit).
export async function resolveChannelToUploadsPlaylistId(
    identifier: YouTubeChannelIdentifier,
): Promise<string | null> {
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) return null;

    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('key', apiKey);

    switch (identifier.type) {
        case 'id':
            url.searchParams.set('id', identifier.value);
            break;
        case 'handle':
            url.searchParams.set('forHandle', identifier.value);
            break;
        case 'username':
        case 'custom':
            url.searchParams.set('forUsername', identifier.value);
            break;
    }

    try {
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        const data = await res.json();
        return (data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads as string) ?? null;
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube keyword search  (used by AI Auto-Curate channels)
// Costs 100 quota units per call — use sparingly.
// ─────────────────────────────────────────────────────────────────────────────

export interface YouTubeSearchResult {
    videos: YouTubeVideoData[];
    nextPageToken: string | null;
}

export async function searchYouTubeVideos(
    query: string,
    pageToken?: string | null,
    maxResults: number = 50,
): Promise<YouTubeSearchResult> {
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) {
        console.error('YouTube API Key is missing.');
        return { videos: [], nextPageToken: null };
    }

    try {
        // 1. search.list — returns video IDs + nextPageToken
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        searchUrl.searchParams.set('part', 'id');
        searchUrl.searchParams.set('q', query);
        searchUrl.searchParams.set('type', 'video');
        searchUrl.searchParams.set('maxResults', String(maxResults));
        searchUrl.searchParams.set('key', apiKey);
        if (pageToken) searchUrl.searchParams.set('pageToken', pageToken);

        const searchRes = await fetch(searchUrl.toString());
        if (!searchRes.ok) throw new Error(`YouTube search API error: ${searchRes.status}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const searchData: any = await searchRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoIds: string[] = (searchData.items ?? []).map((item: any) => item.id.videoId);

        if (videoIds.length === 0) {
            return { videos: [], nextPageToken: searchData.nextPageToken ?? null };
        }

        // 2. videos.list — fetch full metadata for returned video IDs
        const detailsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.join(',')}&part=snippet,contentDetails&key=${apiKey}`
        );
        if (!detailsRes.ok) throw new Error(`YouTube video details API error: ${detailsRes.status}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detailsData: any = await detailsRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videos: YouTubeVideoData[] = (detailsData.items ?? []).map((video: any) => {
            const durationISO = video.contentDetails.duration;
            return {
                id: video.id,
                title: video.snippet.title,
                channelTitle: video.snippet.channelTitle,
                duration: durationISO,
                durationSeconds: parseYouTubeDuration(durationISO),
                thumbnailUrl:
                    video.snippet.thumbnails.medium?.url ||
                    video.snippet.thumbnails.default?.url || '',
            };
        // Filter out YouTube Shorts and unplayable videos (< 60 s)
        }).filter((v: YouTubeVideoData) => v.durationSeconds >= 60);

        return { videos, nextPageToken: searchData.nextPageToken ?? null };
    } catch (error) {
        console.error('Error searching YouTube:', error);
        return { videos: [], nextPageToken: null };
    }
}

// Fetch all video IDs and details from a playlist
export async function fetchYouTubePlaylistVideos(playlistId: string): Promise<YouTubeVideoData[]> {
    if (!process.env.NEXT_PUBLIC_YOUTUBE_API_KEY) {
        console.error('YouTube API Key is missing.');
        return [];
    }

    try {
        // 1. Get playlist items (video IDs)
        let videoIds: string[] = [];
        let nextPageToken = '';
        const maxResults = 50; // Max allowed by API

        do {
            const playlistRes = await fetch(
                `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${maxResults}&playlistId=${playlistId}&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
            );
            if (!playlistRes.ok) throw new Error(`Playlist API error: ${playlistRes.status}`);

            const playlistData = await playlistRes.json();
            if (playlistData.items) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                videoIds = [...videoIds, ...playlistData.items.map((item: any) => item.contentDetails.videoId)];
            }
            nextPageToken = playlistData.nextPageToken || '';
        } while (nextPageToken && videoIds.length < 200); // hard cap at 200 to prevent infinite loops / rate limits

        if (videoIds.length === 0) return [];

        // 2. Fetch full details for the retrieved video IDs (batched by 50)
        let allVideos: YouTubeVideoData[] = [];

        for (let i = 0; i < videoIds.length; i += 50) {
            const batchIds = videoIds.slice(i, i + 50).join(',');
            const videoRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?id=${batchIds}&part=snippet,contentDetails&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`
            );
            if (!videoRes.ok) continue;

            const videoData = await videoRes.json();
            if (videoData.items) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mapped = videoData.items.map((video: any) => {
                    const durationISO = video.contentDetails.duration;
                    return {
                        id: video.id,
                        title: video.snippet.title,
                        channelTitle: video.snippet.channelTitle,
                        duration: durationISO,
                        durationSeconds: parseYouTubeDuration(durationISO),
                        thumbnailUrl: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url || '',
                    };
                });
                // Filter out live streams or unplayable videos (duration 0)
                allVideos = [...allVideos, ...mapped.filter((v: YouTubeVideoData) => v.durationSeconds > 0)];
            }
        }

        return allVideos;
    } catch (error) {
        console.error('Error fetching playlist details:', error);
        return [];
    }
}

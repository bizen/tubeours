export interface TimetableSlot {
    id: string;
    timetable_id: string;
    scheduled_start_timestamp: string;
    video: {
        id: string;
        youtube_video_id: string;
        title: string;
        channel_title: string;
        duration_seconds: number;
        thumbnail_url: string;
    };
}

export interface Timetable {
    id: string;
    title: string;
    description: string | null;
    is_public: boolean;
    is_auto_generated: boolean;
    source_type: 'playlist' | 'curation_group' | 'keyword' | null;
    source_id: string | null;
    slots?: TimetableSlot[];
}

export interface CurationGroup {
    id: string;
    name: string;
    description: string | null;
    is_public: boolean;
    accounts?: GroupYouTubeAccount[];
}

export interface GroupYouTubeAccount {
    id: string;
    youtube_channel_id: string;
    youtube_channel_name: string | null;
}

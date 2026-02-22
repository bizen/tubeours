export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string
                    username: string
                    avatar_url: string | null
                    created_at: string
                }
                Insert: {
                    id: string
                    username: string
                    avatar_url?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    username?: string
                    avatar_url?: string | null
                    created_at?: string
                }
            }
            curation_groups: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    is_public: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    description?: string | null
                    is_public?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    is_public?: boolean
                    created_at?: string
                }
            }
            group_youtube_accounts: {
                Row: {
                    id: string
                    group_id: string
                    youtube_channel_id: string
                    youtube_channel_name: string | null
                    added_at: string
                }
                Insert: {
                    id?: string
                    group_id: string
                    youtube_channel_id: string
                    youtube_channel_name?: string | null
                    added_at?: string
                }
                Update: {
                    id?: string
                    group_id?: string
                    youtube_channel_id?: string
                    youtube_channel_name?: string | null
                    added_at?: string
                }
            }
            follows: {
                Row: {
                    follower_id: string
                    following_id: string
                    created_at: string
                }
                Insert: {
                    follower_id: string
                    following_id: string
                    created_at?: string
                }
                Update: {
                    follower_id?: string
                    following_id?: string
                    created_at?: string
                }
            }
            timetables: {
                Row: {
                    id: string
                    user_id: string
                    title: string
                    description: string | null
                    is_public: boolean
                    is_auto_generated: boolean
                    source_type: string | null
                    source_id: string | null
                    last_generated_at: string | null
                    next_generation_due: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    title: string
                    description?: string | null
                    is_public?: boolean
                    is_auto_generated?: boolean
                    source_type?: string | null
                    source_id?: string | null
                    last_generated_at?: string | null
                    next_generation_due?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    title?: string
                    description?: string | null
                    is_public?: boolean
                    is_auto_generated?: boolean
                    source_type?: string | null
                    source_id?: string | null
                    last_generated_at?: string | null
                    next_generation_due?: string | null
                    created_at?: string
                }
            }
            videos: {
                Row: {
                    id: string
                    youtube_video_id: string
                    title: string
                    channel_title: string
                    duration_seconds: number
                    thumbnail_url: string
                }
                Insert: {
                    id?: string
                    youtube_video_id: string
                    title: string
                    channel_title: string
                    duration_seconds: number
                    thumbnail_url: string
                }
                Update: {
                    id?: string
                    youtube_video_id?: string
                    title?: string
                    channel_title?: string
                    duration_seconds?: number
                    thumbnail_url?: string
                }
            }
            timetable_slots: {
                Row: {
                    id: string
                    timetable_id: string
                    video_id: string
                    scheduled_start_timestamp: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    timetable_id: string
                    video_id: string
                    scheduled_start_timestamp: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    timetable_id?: string
                    video_id?: string
                    scheduled_start_timestamp?: string
                    created_at?: string
                }
            }
        }
    }
}

-- Drop existing tables to recreate with new schema
DROP TABLE IF EXISTS public.timetable_slots CASCADE;
DROP TABLE IF EXISTS public.timetables CASCADE;
DROP TABLE IF EXISTS public.videos CASCADE;
DROP TABLE IF EXISTS public.follows CASCADE;
DROP TABLE IF EXISTS public.curation_groups CASCADE;
DROP TABLE IF EXISTS public.group_youtube_accounts CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Create users table (extends auth.users)
CREATE TABLE public.users (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  username text UNIQUE NOT NULL,
  avatar_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================
-- CURATION GROUPS (New Feature)
-- =========================================
-- Allows grouping multiple YouTube accounts together to form a "curation source"
CREATE TABLE public.curation_groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) NOT NULL, -- Owner of the group
  name text NOT NULL, -- e.g. "Tech YouTubers", "Lofi Music Creators"
  description text,
  is_public boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- YouTube accounts (Channel IDs) associated with a specific curation group
CREATE TABLE public.group_youtube_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid REFERENCES public.curation_groups(id) ON DELETE CASCADE NOT NULL,
  youtube_channel_id text NOT NULL, -- The actual YouTube channel ID
  youtube_channel_name text, -- Cached channel name for UI
  added_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(group_id, youtube_channel_id)
);

-- =========================================
-- TIMETABLES & VIDEOS
-- =========================================
CREATE TABLE public.timetables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) NOT NULL,
  title text NOT NULL,
  description text,
  is_public boolean DEFAULT false NOT NULL,
  
  -- Metadata for automated generation
  is_auto_generated boolean DEFAULT true NOT NULL,
  source_type text CHECK (source_type IN ('playlist', 'ai')),
  source_id text, -- Stores YouTube Playlist ID for 'playlist' channels
  last_generated_at timestamp with time zone,
  next_generation_due timestamp with time zone,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.videos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  youtube_video_id text UNIQUE NOT NULL,
  title text NOT NULL,
  channel_title text NOT NULL,
  duration_seconds integer NOT NULL,
  thumbnail_url text NOT NULL
);

CREATE TABLE public.timetable_slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timetable_id uuid REFERENCES public.timetables(id) ON DELETE CASCADE NOT NULL,
  video_id uuid REFERENCES public.videos(id) NOT NULL,
  
  -- Start time is now a full timestamp to handle week-long schedules
  scheduled_start_timestamp timestamp with time zone NOT NULL, 
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================
-- AI CHANNEL CONFIG (Mode B: AI Auto-Curate)
-- =========================================
-- Stores LLM-generated search queries and pagination state per AI channel
CREATE TABLE public.ai_channel_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timetable_id uuid UNIQUE NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
  theme text NOT NULL,                    -- Original user theme input
  search_queries jsonb NOT NULL DEFAULT '[]'::jsonb,   -- string[] — LLM-generated query list
  current_query_index integer NOT NULL DEFAULT 0,      -- Which query we're currently paginating
  next_page_tokens jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "0": "token...", "1": null } per query index
  last_refill_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================
-- SOCIAL FOLLOWS
-- =========================================
CREATE TABLE public.follows (
  follower_id uuid REFERENCES public.users(id) NOT NULL,
  following_id uuid REFERENCES public.users(id) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

-- =========================================
-- SECURITY (Row Level Security)
-- =========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_youtube_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_channel_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Basic Public Policies
CREATE POLICY "Public profiles are viewable by everyone." ON public.users FOR SELECT USING (true);
CREATE POLICY "Public timetables are viewable by everyone." ON public.timetables FOR SELECT USING (is_public = true);
CREATE POLICY "Public curation groups are viewable by everyone." ON public.curation_groups FOR SELECT USING (is_public = true);
CREATE POLICY "Accounts in public groups are viewable." ON public.group_youtube_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.curation_groups g WHERE g.id = group_id AND g.is_public = true)
);
CREATE POLICY "Videos are listable by everyone." ON public.videos FOR SELECT USING (true);
CREATE POLICY "Slots for public timetables are viewable by everyone." ON public.timetable_slots FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.timetables t WHERE t.id = timetable_id AND t.is_public = true)
);

-- Authenticated User Policies (Users can completely manage their own data)
CREATE POLICY "Users can manage their own timetables." ON public.timetables FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage slots for their own timetables." ON public.timetable_slots FOR ALL USING (
  EXISTS (SELECT 1 FROM public.timetables t WHERE t.id = timetable_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can manage their own ai channel configs." ON public.ai_channel_configs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.timetables t WHERE t.id = timetable_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can manage their curation groups." ON public.curation_groups FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage accounts in their groups." ON public.group_youtube_accounts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.curation_groups g WHERE g.id = group_id AND g.user_id = auth.uid())
);

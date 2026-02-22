-- Migration: Add AI channel support
-- Run this in the Supabase SQL Editor on your existing database.

-- 1. Update source_type constraint to include 'ai'
ALTER TABLE public.timetables
  DROP CONSTRAINT IF EXISTS timetables_source_type_check;

ALTER TABLE public.timetables
  ADD CONSTRAINT timetables_source_type_check
  CHECK (source_type IN ('playlist', 'ai'));

-- 2. Create ai_channel_configs table
CREATE TABLE IF NOT EXISTS public.ai_channel_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timetable_id uuid UNIQUE NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
  theme text NOT NULL,
  search_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_query_index integer NOT NULL DEFAULT 0,
  next_page_tokens jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refill_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS on new table
ALTER TABLE public.ai_channel_configs ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy: users can only manage their own AI channel configs
CREATE POLICY "Users can manage their own ai channel configs."
  ON public.ai_channel_configs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.timetables t
      WHERE t.id = timetable_id AND t.user_id = auth.uid()
    )
  );

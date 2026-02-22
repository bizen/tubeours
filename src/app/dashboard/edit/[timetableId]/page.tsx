import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import EditChannel from './EditChannel';

interface PageProps {
    params: Promise<{ timetableId: string }>;
}

export default async function EditChannelPage({ params }: PageProps) {
    const { timetableId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    const { data: timetable } = await supabase
        .from('timetables')
        .select('id, title, description, is_public, source_type, source_id')
        .eq('id', timetableId)
        .eq('user_id', user.id)
        .single();

    if (!timetable) notFound();

    // Fetch AI config if applicable
    let aiTheme: string | null = null;
    if (timetable.source_type === 'ai') {
        const { data: aiConfig } = await supabase
            .from('ai_channel_configs')
            .select('theme')
            .eq('timetable_id', timetableId)
            .single();
        aiTheme = aiConfig?.theme ?? null;
    }

    return <EditChannel timetable={timetable} aiTheme={aiTheme} />;
}

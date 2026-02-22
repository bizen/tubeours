import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;
    const next = requestUrl.searchParams.get('next') ?? '/';

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data?.user) {
            // Ensure the user exists in our public.users table to satisfy FK constraints
            const { id, email, user_metadata } = data.user;

            await supabase.from('users').upsert({
                id: id,
                username: user_metadata?.user_name || user_metadata?.name || email?.split('@')[0] || 'user_' + id.substring(0, 5),
                avatar_url: user_metadata?.avatar_url || null,
            }, { onConflict: 'id' });
        }
    }

    // URL to redirect to after sign in process completes
    return NextResponse.redirect(`${origin}${next}`);
}

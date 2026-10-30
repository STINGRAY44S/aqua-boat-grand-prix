import { createBrowserClient } from '@supabase/ssr';

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Placeholder values allow the landing/setup screen to render before configuration.
  // Auth/data actions remain hidden until real environment variables are supplied.
  return createBrowserClient(url || 'https://placeholder.supabase.co', key || 'placeholder-anon-key');
}

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type Cookie = { name: string; value: string; options?: Record<string, unknown> };

type SupabaseFromMiddleware = ReturnType<typeof createServerClient>;

export async function createSupabaseMiddlewareClient(request: NextRequest): Promise<{
  supabase: SupabaseFromMiddleware | null;
  response: NextResponse;
}> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { supabase: null, response };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Cookie[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, response };
}

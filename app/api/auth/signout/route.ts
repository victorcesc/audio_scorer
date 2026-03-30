import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/public-url";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Supabase not configured
  }
  const origin = getPublicOrigin(request);
  return NextResponse.redirect(new URL("/login", origin), { status: 302 });
}

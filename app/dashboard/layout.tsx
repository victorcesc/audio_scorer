import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-3 flex flex-wrap gap-3 justify-between items-center">
        <Link href="/dashboard" className="font-semibold">
          Audio Scorer
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {user?.email && (
            <span className="truncate max-w-[200px] sm:max-w-xs" title={user.email}>
              {user.email}
            </span>
          )}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="text-foreground underline-offset-4 hover:underline text-sm"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}

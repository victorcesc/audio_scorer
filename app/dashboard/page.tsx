import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PhoneNumbersSection from "./PhoneNumbersSection";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: phoneRows } = await supabase
    .from("authorized_whatsapp_numbers")
    .select("phone, audio_analyzed_count")
    .order("created_at", { ascending: true });

  const numbers =
    phoneRows?.map((row) => ({
      phone: row.phone,
      audio_analyzed_count: row.audio_analyzed_count ?? 0,
    })) ?? [];

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold">Painel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seus números do WhatsApp e acompanhe o uso pelo bot. O login é feito com seu
          e-mail.
        </p>
      </div>

      <PhoneNumbersSection numbers={numbers} />
    </main>
  );
}

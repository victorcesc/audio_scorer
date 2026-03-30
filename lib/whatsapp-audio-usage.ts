import { createAdminClient } from "@/lib/supabase/admin";

/** Incrementa contador de áudios processados (RPC no Supabase). Erros só em log. */
export async function incrementWhatsappAudioCount(
  canonicalPhone: string,
  delta: number
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("increment_whatsapp_audio_count", {
      p_phone: canonicalPhone,
      p_delta: delta,
    });
    if (error) {
      console.error(
        "[whatsapp-audio-usage] rpc increment_whatsapp_audio_count message=" +
          (error.message || "")
      );
    }
  } catch (e) {
    console.error(
      "[whatsapp-audio-usage] rpc error message=" +
        (e instanceof Error ? e.message : String(e))
    );
  }
}

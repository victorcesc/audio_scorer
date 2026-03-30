/**
 * Lookup de linhas em authorized_whatsapp_numbers (telefone WhatsApp do bot).
 * Usado por reply-config e analyze-audio-batch.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getBrazilianPhoneLookupVariants, normalizeBrazilianPhone } from "@/lib/phone";

export type AuthorizedWhatsappRow = {
  phone: string;
  bot_config: unknown;
};

export type AuthorizedWhatsappOwnershipRow = {
  phone: string;
  user_id: string | null;
};

function parseAuthorizedWhatsappRow(data: unknown): AuthorizedWhatsappRow | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.phone !== "string") return null;
  return { phone: o.phone, bot_config: o.bot_config };
}

function parseAuthorizedWhatsappOwnershipRow(
  data: unknown
): AuthorizedWhatsappOwnershipRow | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.phone !== "string") return null;
  if (!("user_id" in o)) return null;
  const uid = o.user_id;
  if (uid !== null && typeof uid !== "string") return null;
  return { phone: o.phone, user_id: uid };
}

async function fetchFirstAuthorizedHit<T>(
  variants: string[],
  select: string,
  parse: (data: unknown) => T | null
): Promise<T | null> {
  const supabase = createAdminClient();
  for (const v of variants) {
    const res = await supabase
      .from("authorized_whatsapp_numbers")
      .select(select)
      .eq("phone", v)
      .maybeSingle();
    if (res.error) {
      console.error(
        "[bot-authorized-phone] supabase_error table=authorized_whatsapp_numbers phone=" +
          v +
          " message=" +
          (res.error?.message || "")
      );
      continue;
    }
    const row = parse(res.data);
    if (row) return row;
  }
  return null;
}

export async function findAuthorizedWhatsappRowByVariants(
  variants: string[]
): Promise<AuthorizedWhatsappRow | null> {
  return fetchFirstAuthorizedHit(variants, "phone, bot_config", parseAuthorizedWhatsappRow);
}

/**
 * Aceita número como veio do cliente (com máscara ou não).
 * Se normalização resultar vazio → null.
 * Se não existir linha autorizada → null.
 */
export async function findAuthorizedWhatsappRowForLookup(
  rawPhone: string
): Promise<AuthorizedWhatsappRow | null> {
  const digitsOnly = rawPhone.replace(/\D/g, "");
  const normalized = normalizeBrazilianPhone(digitsOnly);
  if (!normalized.length) return null;
  const variants = getBrazilianPhoneLookupVariants(digitsOnly);
  return findAuthorizedWhatsappRowByVariants(variants);
}

/** Lookup admin: telefone canônico no BD + dono (para cadastro no painel). */
export async function findAuthorizedWhatsappOwnershipRowByVariants(
  variants: string[]
): Promise<AuthorizedWhatsappOwnershipRow | null> {
  return fetchFirstAuthorizedHit(
    variants,
    "phone, user_id",
    parseAuthorizedWhatsappOwnershipRow
  );
}

export async function findAuthorizedWhatsappOwnershipByRawPhone(
  rawPhone: string
): Promise<AuthorizedWhatsappOwnershipRow | null> {
  const digitsOnly = rawPhone.replace(/\D/g, "");
  const normalized = normalizeBrazilianPhone(digitsOnly);
  if (!normalized.length) return null;
  const variants = getBrazilianPhoneLookupVariants(digitsOnly);
  return findAuthorizedWhatsappOwnershipRowByVariants(variants);
}

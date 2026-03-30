/** DDDs válidos no Brasil (11 a 99). */
const VALID_DDD = /^(1[1-9]|[2-9]\d)$/;

/**
 * Extrai só dígitos 0-9 a partir do que o utilizador cola ou digita.
 * NFKC converte dígitos “largos” (ex.: ４ em PDF) e variantes Unicode para ASCII.
 */
export function digitsOnlyFromBrazilianPhoneInput(input: string): string {
  return String(input).trim().normalize("NFKC").replace(/\D/g, "");
}

/**
 * Celular no padrão antigo: DDD + 9 + 8 dígitos (10 no total sem o 55).
 * Insere o 9 após o DDD (padrão atual) para alinhar ao E.164 usado no WhatsApp.
 */
function expandLegacyMobileNationalTenDigits(nationalTen: string): string {
  if (nationalTen.length !== 10) return nationalTen;
  const ddd = nationalTen.slice(0, 2);
  if (!VALID_DDD.test(ddd)) return nationalTen;
  if (nationalTen[2] !== "9") return nationalTen;
  return ddd + "9" + nationalTen.slice(2);
}

/**
 * Normaliza número brasileiro para sempre ter o prefixo 55.
 * Aceita número com ou sem 55; se tiver 10 ou 11 dígitos (DDD + número), adiciona 55.
 * Celulares no formato antigo (10 dígitos com 9 após o DDD) ganham o 9 extra antes do restante.
 */
export function normalizeBrazilianPhone(digits: string): string {
  let only = digitsOnlyFromBrazilianPhoneInput(digits);
  if (!only.length) return only;
  if (only.startsWith("55") && only.length >= 12) {
    if (only.length === 12) {
      const national = only.slice(2);
      const expanded = expandLegacyMobileNationalTenDigits(national);
      if (expanded.length === 11) only = "55" + expanded;
    }
    return only;
  }
  if (only.length === 10) {
    const expanded = expandLegacyMobileNationalTenDigits(only);
    if (expanded.length === 11) only = expanded;
  }
  if (only.length === 10 || only.length === 11) return "55" + only;
  return only;
}

/** Só dígitos nacionais (DDD + número), removendo 55 inicial quando o usuário o digitou. */
export function digitsBrazilianNationalFromInput(input: string): string {
  let only = digitsOnlyFromBrazilianPhoneInput(input);
  if (only.startsWith("55") && only.length >= 12) only = only.slice(2);
  return only;
}

/**
 * Formata número já normalizado (55…) para exibição ao usuário.
 * Corrige visualmente registros legados gravados com 12 dígitos (sem o 9 após o DDD).
 */
export function formatBrazilianPhoneForDisplay(stored: string): string {
  let only = digitsOnlyFromBrazilianPhoneInput(stored);
  if (!only.length) return stored;
  if (only.startsWith("55") && only.length === 12) {
    const national = only.slice(2);
    const expanded = expandLegacyMobileNationalTenDigits(national);
    if (expanded.length === 11) only = "55" + expanded;
  }
  if (only.startsWith("55") && only.length >= 13) {
    const rest = only.slice(2);
    if (rest.length === 11 && rest[2] === "9") {
      const ddd = rest.slice(0, 2);
      const subscriber = rest.slice(3);
      if (subscriber.length === 8) {
        return `+55 (${ddd}) ${rest[2]}${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
      }
    }
  }
  if (only.startsWith("55") && only.length === 12) {
    const rest = only.slice(2);
    if (rest.length === 10) {
      const ddd = rest.slice(0, 2);
      const num = rest.slice(2);
      return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
    }
  }
  return stored;
}

/**
 * Variantes de `phone` usadas em consultas ao BD (authorized_whatsapp_numbers, etc.).
 * `digitsOnly` deve ser só dígitos (ex.: output de `raw.replace(/\D/g, "")`).
 */
export function getBrazilianPhoneLookupVariants(digitsOnly: string): string[] {
  const normalized = normalizeBrazilianPhone(digitsOnly);
  if (!normalized.length) return [];

  const variants: string[] = [normalized];
  if (normalized.startsWith("55") && normalized.length >= 12) {
    variants.push(normalized.slice(2));
    if (normalized.length === 12) {
      const withMobile9 = normalized.slice(0, 4) + "9" + normalized.slice(4);
      variants.push(withMobile9);
    }
    // 55 + DDD + 9 + 8 dígitos (13): alguns registos antigos gravam sem o 9 (12 dígitos)
    if (normalized.length === 13 && normalized[4] === "9") {
      const legacy12 = normalized.slice(0, 4) + normalized.slice(5);
      variants.push(legacy12);
    }
  } else if (digitsOnly.length === 10 || digitsOnly.length === 11) {
    variants.push("55" + digitsOnly);
  }
  return [...new Set(variants)];
}

/**
 * Valida número brasileiro (DDD + número, sem 55).
 * Retorna { valid: true } ou { valid: false, error: string }.
 */
export function validateBrazilianPhone(input: string): { valid: true } | { valid: false; error: string } {
  const only = digitsOnlyFromBrazilianPhoneInput(input);
  if (only.startsWith("55") && only.length >= 12) {
    return validateBrazilianPhone(only.slice(2));
  }
  if (only.length === 0) {
    return { valid: false, error: "Digite o número com DDD." };
  }
  if (only.length < 10) {
    return { valid: false, error: "Número incompleto. Use DDD + número. Ex: (48) 99999-8888." };
  }
  if (only.length > 11) {
    return {
      valid: false,
      error:
        "Número inválido. Use DDD + número (10 ou 11 dígitos), com ou sem espaços ou traços. Ex.: 48 99941-6002 ou (48) 99999-8888. Se colou o +55, apague o código do país.",
    };
  }
  const ddd = only.slice(0, 2);
  if (!VALID_DDD.test(ddd)) {
    return { valid: false, error: "DDD inválido. Use um código de área válido (11 a 99)." };
  }
  if (only.length === 11) {
    if (only[2] !== "9") {
      return { valid: false, error: "Celular deve começar com 9 após o DDD. Ex: (48) 99999-8888." };
    }
  }
  return { valid: true };
}

/**
 * CPF (11) ou CNPJ (14) — apenas dígitos, validação leve (tamanho + dígitos repetidos).
 */
export function normalizeBrazilianDocument(input: string): string {
  return input.replace(/\D/g, "");
}

export function validateBrazilianDocument(
  digits: string
): { valid: true } | { valid: false; error: string } {
  if (!digits.length) {
    return { valid: false, error: "Informe o CPF ou CNPJ." };
  }
  if (digits.length !== 11 && digits.length !== 14) {
    return {
      valid: false,
      error: "CPF deve ter 11 dígitos ou CNPJ 14 dígitos (apenas números).",
    };
  }
  if (/^(\d)\1+$/.test(digits)) {
    return { valid: false, error: "CPF/CNPJ inválido." };
  }
  return { valid: true };
}

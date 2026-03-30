/**
 * Mensagens de erro de auth do Supabase costumam vir em inglês; expomos PT-BR ao usuário.
 */
export function mapSupabaseAuthError(message: string): string {
  const m = message.toLowerCase().trim();
  if (m.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.";
  }
  if (m.includes("user already registered")) {
    return "Este e-mail já está cadastrado.";
  }
  if (m.includes("password should be at least")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  if (m.includes("invalid email")) {
    return "E-mail inválido.";
  }
  if (m.includes("signup is disabled")) {
    return "Novos cadastros estão desativados. Contate o suporte.";
  }
  return message;
}

/**
 * Profissões oferecidas no fluxo de ativação (/ativar).
 * Alinhado a docs/brainstorms/20260318140000-bot-config-by-profession-brainstorm.md (linhas 52–56).
 * O slug grava-se em authorized_whatsapp_numbers.bot_config.profileType (mesmo contrato do bot / reply-config).
 */

export const ACTIVATION_PROFESSION_SLUGS = [
  "default",
  "real_estate",
  "insurance",
  "b2b_sales",
] as const;

export type ActivationProfessionSlug = (typeof ACTIVATION_PROFESSION_SLUGS)[number];

export function isActivationProfessionSlug(value: string): value is ActivationProfessionSlug {
  return (ACTIVATION_PROFESSION_SLUGS as readonly string[]).includes(value);
}

export const ACTIVATION_PROFESSION_OPTIONS: {
  slug: ActivationProfessionSlug;
  title: string;
  hint: string;
}[] = [
  {
    slug: "default",
    title: "Nenhuma profissão específica (modo normal)",
    hint: "Análise genérica: mesmo comportamento padrão do produto (prompt único sem foco por segmento). Você pode mudar depois com *perfil* no WhatsApp.",
  },
  {
    slug: "real_estate",
    title: "Corretor(a) imobiliário(a)",
    hint: "Perfil do imóvel e linha do tempo da decisão do lead.",
  },
  {
    slug: "insurance",
    title: "Corretor(a) de seguros / planos de saúde",
    hint: "Necessidade de cobertura e orçamento / quem decide.",
  },
  {
    slug: "b2b_sales",
    title: "Vendas B2B / consultor(a) comercial",
    hint: "BANT e objeções ou dúvidas do lead.",
  },
];

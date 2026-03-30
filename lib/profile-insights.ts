/**
 * Dois pontos de análise por perfil (brainstorm §3) — rótulos na mensagem + instruções ao GPT.
 */

export type ProfileInsightLabels = {
  insight1Title: string;
  insight2Title: string;
};

export function getProfileInsightLabels(profileType: string): ProfileInsightLabels {
  const p = (profileType || "default").trim().toLowerCase();
  switch (p) {
    case "real_estate":
      return {
        insight1Title: "Perfil do imóvel",
        insight2Title: "Timeline e decisão",
      };
    case "insurance":
      return {
        insight1Title: "Necessidade de cobertura",
        insight2Title: "Orçamento e quem decide",
      };
    case "b2b_sales":
      return {
        insight1Title: "BANT (síntese)",
        insight2Title: "Objeções e dúvidas",
      };
    default:
      return {
        insight1Title: "Ponto chave 1",
        insight2Title: "Ponto chave 2",
      };
  }
}

/** Bloco extra do system prompt: o que preencher em profileInsight1 / profileInsight2 */
export function getProfileInsightGptHints(profileType: string): string {
  const p = (profileType || "default").trim().toLowerCase();
  switch (p) {
    case "real_estate":
      return `Para profileInsight1: quartos, região, faixa de preço, finalidade (morar/investir), tipo de imóvel — só o que o lead disser.
Para profileInsight2: quando quer mudar/comprar, se já vendeu imóvel, quem decide na família, urgência.`;
    case "insurance":
      return `Para profileInsight1: tipo de cobertura (vida, saúde, auto, residencial, etc.), perfil ou risco mencionado.
Para profileInsight2: orçamento ou faixa, quem paga, quem decide, prazo para fechar — só o que aparecer na fala.`;
    case "b2b_sales":
      return `Para profileInsight1: uma linha sintetizando Budget, Authority, Need e Timeline (BANT) com base no áudio.
Para profileInsight2: principais objeções, dúvidas ou resistências que o lead expressou.`;
    default:
      return `Para profileInsight1: o dado mais relevante para qualificar o lead além do resumo.
Para profileInsight2: segundo dado relevante ou contexto útil ao vendedor.`;
  }
}

import { getProfileInsightGptHints, getProfileInsightLabels } from "@/lib/profile-insights";

const QUALIFICATION_CORE = `Você é um especialista em qualificação de leads de vendas (imóveis, serviços B2B, etc.).
Analise a transcrição do áudio do lead e retorne APENAS um JSON válido, sem markdown ou texto extra, com as chaves exatas:
- summary: resumo executivo em 1 ou 2 frases (ex.: "Cliente quer apartamento de 3 quartos no Centro, orçamento até R$ 800k, pressa alta").
- score: número de 0 a 10 (lead score baseado em BANT).
- bantReasons: texto curto explicando Budget, Authority, Need e Timeline com base no que o lead disse.
- nextStep: próximo passo sugerido para o vendedor (ex.: "Agendar visita para sábado" ou "Descartar (fora de perfil)").
- profileInsight1: texto curto (veja instruções específicas abaixo para este perfil).
- profileInsight2: texto curto (veja instruções específicas abaixo para este perfil).

Critérios BANT para o score:
- Budget: tem orçamento definido ou faixa?
- Authority: é quem decide ou influencia?
- Need: necessidade clara (produto/serviço)?
- Timeline: prazo/urgência mencionados?

Score 0-3: lead frio ou fora de perfil. 4-6: potencial, precisa nutrir. 7-10: quente, priorizar contato.

Se não houver informação suficiente para profileInsight1 ou profileInsight2, use um travessão "—" ou frase muito curta neutra (ex.: "Não mencionado no áudio").`;

/**
 * System prompt completo incluindo instruções dos dois focos do perfil.
 */
export function buildQualificationSystemPrompt(profileType: string): string {
  const { insight1Title, insight2Title } = getProfileInsightLabels(profileType);
  const hints = getProfileInsightGptHints(profileType);
  return `${QUALIFICATION_CORE}

Nome dos dois focos neste perfil (apenas referência; no JSON use sempre as chaves profileInsight1 e profileInsight2):
- "${insight1Title}" → profileInsight1
- "${insight2Title}" → profileInsight2

Instruções por foco:
${hints}`;
}

/** @deprecated use buildQualificationSystemPrompt("default") se precisar do texto estático */
export const QUALIFICATION_SYSTEM_PROMPT = buildQualificationSystemPrompt("default");

export function buildQualificationUserPrompt(
  transcript: string,
  profileType: string = "default"
): string {
  const { insight1Title, insight2Title } = getProfileInsightLabels(profileType);
  return `Transcrição do áudio do lead:\n\n${transcript}\n\nRetorne apenas o JSON com summary, score, bantReasons, nextStep, profileInsight1 (${insight1Title}), profileInsight2 (${insight2Title}).`;
}

export const QUALIFICATION_USER_PROMPT = (transcript: string) =>
  buildQualificationUserPrompt(transcript, "default");

/** Vários trechos (áudios encaminhados), cada um com rótulo de horário — uma qualificação agregada. */
export function buildQualificationBatchSystemPrompt(profileType: string): string {
  return `${buildQualificationSystemPrompt(profileType)}

Contexto adicional: o texto abaixo pode conter VÁRIOS trechos de áudios distintos (o cliente encaminhou várias mensagens de voz). Cada trecho está precedido por um rótulo de data/hora. Considere o conjunto como uma única oportunidade / conversa e retorne UM único JSON agregado (summary, score, bantReasons, nextStep, profileInsight1, profileInsight2) para o lead no geral.`;
}

export const QUALIFICATION_BATCH_SYSTEM_PROMPT = buildQualificationBatchSystemPrompt("default");

export function buildQualificationBatchUserPrompt(
  labeledTranscripts: string,
  profileType: string = "default"
): string {
  const { insight1Title, insight2Title } = getProfileInsightLabels(profileType);
  return `Transcrições (múltiplos áudios, por ordem):\n\n${labeledTranscripts}\n\nRetorne apenas o JSON com summary, score, bantReasons, nextStep, profileInsight1 (${insight1Title}), profileInsight2 (${insight2Title}).`;
}

export const QUALIFICATION_BATCH_USER_PROMPT = (labeledTranscripts: string) =>
  buildQualificationBatchUserPrompt(labeledTranscripts, "default");

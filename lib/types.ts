export interface LeadQualification {
  summary: string;
  score: number;
  bantReasons: string;
  nextStep: string;
  /** Foco 1 do perfil (ex.: necessidade de cobertura para insurance) — vazio se não veio no JSON */
  profileInsight1: string;
  /** Foco 2 do perfil — vazio se não veio no JSON */
  profileInsight2: string;
}

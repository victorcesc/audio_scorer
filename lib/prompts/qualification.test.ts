import {
  QUALIFICATION_SYSTEM_PROMPT,
  QUALIFICATION_USER_PROMPT,
  buildQualificationSystemPrompt,
  buildQualificationUserPrompt,
} from "./qualification";

describe("qualification prompts", () => {
  it("QUALIFICATION_SYSTEM_PROMPT (default) contém chaves JSON e BANT", () => {
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("summary");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("score");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("bantReasons");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("nextStep");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("profileInsight1");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("profileInsight2");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("BANT");
    expect(QUALIFICATION_SYSTEM_PROMPT).toContain("0 a 10");
  });

  it("perfil insurance menciona necessidade de cobertura nas instruções", () => {
    const sys = buildQualificationSystemPrompt("insurance");
    expect(sys).toContain("Necessidade de cobertura");
    expect(sys).toContain("Orçamento");
    const user = buildQualificationUserPrompt("transcrição teste", "insurance");
    expect(user).toContain("profileInsight1");
    expect(user).toContain("Necessidade de cobertura");
  });

  it("QUALIFICATION_USER_PROMPT (default) interpola transcript", () => {
    const transcript = "Olá, quero um apartamento de 3 quartos.";
    const out = QUALIFICATION_USER_PROMPT(transcript);
    expect(out).toContain(transcript);
    expect(out).toContain("Transcrição do áudio do lead");
    expect(out).toContain("JSON");
  });
});

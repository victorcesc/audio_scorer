import {
  digitsBrazilianNationalFromInput,
  digitsOnlyFromBrazilianPhoneInput,
  formatBrazilianPhoneForDisplay,
  normalizeBrazilianPhone,
  getBrazilianPhoneLookupVariants,
  validateBrazilianPhone,
} from "./phone";

describe("normalizeBrazilianPhone", () => {
  it("retorna string vazia para entrada vazia", () => {
    expect(normalizeBrazilianPhone("")).toBe("");
  });

  it("remove caracteres não numéricos antes de normalizar", () => {
    expect(normalizeBrazilianPhone("(48) 99999-8888")).toBe("5548999998888");
    expect(normalizeBrazilianPhone("48 9 9999 8888")).toBe("5548999998888");
    expect(normalizeBrazilianPhone("48 99941-6002")).toBe("5548999416002");
  });

  it("aceita espaço em branco à volta e formato colado comum no cadastro", () => {
    expect(digitsOnlyFromBrazilianPhoneInput("  48 99941-6002 \u00a0")).toBe("48999416002");
    expect(validateBrazilianPhone("48 99941-6002")).toEqual({ valid: true });
    expect(normalizeBrazilianPhone("48 99941-6002")).toBe("5548999416002");
  });

  it("normaliza dígitos largos Unicode (NFKC) antes de interpretar", () => {
    const pasted = "\uff14\uff18 \uff19\uff19\uff19\uff14\uff11-\uff16\uff10\uff10\uff12"; // ４８ ９９９４１－６００２
    expect(digitsOnlyFromBrazilianPhoneInput(pasted)).toBe("48999416002");
    expect(validateBrazilianPhone(pasted)).toEqual({ valid: true });
  });

  it("expande celular antigo (10 dígitos, 9 após DDD) e adiciona 55", () => {
    expect(normalizeBrazilianPhone("4899998888")).toBe("5548999998888");
  });

  it("não insere 9 extra em fixo de 10 dígitos", () => {
    expect(normalizeBrazilianPhone("4833334444")).toBe("554833334444");
  });

  it("digitsBrazilianNationalFromInput remove não-dígitos e prefixo 55 quando aplicável", () => {
    expect(digitsBrazilianNationalFromInput("(48) 99999-8888")).toBe("48999998888");
    expect(digitsBrazilianNationalFromInput("5548999998888")).toBe("48999998888");
  });

  it("adiciona 55 para número com 11 dígitos (DDD + 9 + 8 dígitos)", () => {
    expect(normalizeBrazilianPhone("48999998888")).toBe("5548999998888");
  });

  it("mantém 13 dígitos com 55 e expande legado de 12 (celular sem 9 após DDD)", () => {
    expect(normalizeBrazilianPhone("5548999998888")).toBe("5548999998888");
    expect(normalizeBrazilianPhone("5521999998888")).toBe("5521999998888");
    expect(normalizeBrazilianPhone("554899998888")).toBe("5548999998888");
  });

  it("retorna como está quando tem 55 mas menos de 12 dígitos (não tenta adicionar 55 de novo)", () => {
    expect(normalizeBrazilianPhone("554899")).toBe("554899");
  });
});

describe("formatBrazilianPhoneForDisplay", () => {
  it("mostra celular com 9 após DDD (13 dígitos com 55)", () => {
    expect(formatBrazilianPhoneForDisplay("5548999998888")).toBe("+55 (48) 99999-8888");
  });

  it("corrige exibição de legado 12 dígitos (celular sem 9 após DDD)", () => {
    expect(formatBrazilianPhoneForDisplay("554899998888")).toBe("+55 (48) 99999-8888");
  });
});

describe("getBrazilianPhoneLookupVariants", () => {
  it("para celular com 55 e 13 dígitos inclui variante legada de 12 dígitos (sem 9 após DDD)", () => {
    const full = "5548998627832";
    const legacy = "554898627832";
    const v = getBrazilianPhoneLookupVariants(full);
    expect(v).toContain(full);
    expect(v).toContain(legacy);
    expect(v).toContain("48998627832");
  });
});

import { normalizeBrazilianDocument, validateBrazilianDocument } from "./document-br";

describe("document-br", () => {
  it("normalizes to digits", () => {
    expect(normalizeBrazilianDocument("12.345.678/0001-90")).toBe("12345678000190");
  });

  it("accepts CPF length 11", () => {
    expect(validateBrazilianDocument("12345678901").valid).toBe(true);
  });

  it("accepts CNPJ length 14", () => {
    expect(validateBrazilianDocument("12345678000190").valid).toBe(true);
  });

  it("rejects wrong length", () => {
    const r = validateBrazilianDocument("123");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toBeTruthy();
  });

  it("rejects all same digit", () => {
    expect(validateBrazilianDocument("11111111111").valid).toBe(false);
  });
});

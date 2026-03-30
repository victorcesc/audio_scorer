/**
 * Testes da API de ativação (cadastro de número com token).
 */
jest.mock("next/server", () => ({
  NextRequest: function () {},
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { POST } from "../route";
import { normalizeBotConfig } from "@/lib/bot-config";

const createAdminClient = require("@/lib/supabase/admin").createAdminClient as jest.Mock;

const validProfile = "real_estate" as const;
const expectedBotConfig = normalizeBotConfig({ profileType: validProfile });

function mockSupabaseActivate(overrides: {
  tokenRow?: { token: string; used_at: string | null } | null;
  fetchError?: unknown;
  updateError?: unknown;
  insertError?: unknown;
} = {}) {
  const {
    tokenRow = { token: "abc123", used_at: null },
    fetchError = null,
    updateError = null,
    insertError = null,
  } = overrides;

  const authorizedUpsertMock = jest.fn().mockResolvedValue(
    insertError ? { error: insertError } : { error: null },
  );

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === "activation_tokens") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(
              fetchError ? { data: null, error: fetchError } : { data: tokenRow, error: null },
            ),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue(
            updateError ? { error: updateError } : { error: null },
          ),
        }),
      };
    }
    if (table === "authorized_whatsapp_numbers") {
      return { upsert: authorizedUpsertMock };
    }
    return {};
  });

  return { from, authorizedUpsertMock };
}

function jsonRequest(body: object) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

describe("POST /api/activate", () => {
  beforeEach(() => {
    const mocked = mockSupabaseActivate();
    createAdminClient.mockReturnValue(mocked);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("retorna 400 quando token está vazio", async () => {
    const req = jsonRequest({ token: "", phone: "48999998888" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/token|obrigatório/i);
  });

  it("retorna 400 quando phone está vazio", async () => {
    const req = jsonRequest({ token: "abc123", phone: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/número|obrigatório/i);
  });

  it("retorna 400 quando número tem menos de 10 dígitos", async () => {
    const req = jsonRequest({ token: "abc123", phone: "489999" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/número|obrigatório/i);
  });

  it("retorna 400 quando token é inválido (não encontrado)", async () => {
    createAdminClient.mockReturnValue(
      mockSupabaseActivate({ tokenRow: null, fetchError: { message: "not found" } }),
    );
    const req = jsonRequest({
      token: "invalid",
      phone: "48999998888",
      profileType: validProfile,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/inválido|utilizado/i);
  });

  it("retorna 400 quando token já foi utilizado", async () => {
    createAdminClient.mockReturnValue(
      mockSupabaseActivate({
        tokenRow: { token: "abc123", used_at: "2024-01-01T00:00:00Z" },
      }),
    );
    const req = jsonRequest({
      token: "abc123",
      phone: "48999998888",
      profileType: validProfile,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/já foi utilizado/i);
  });

  it("retorna 400 quando profileType está ausente", async () => {
    const req = jsonRequest({ token: "abc123", phone: "48999998888" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/perfil|válid/i);
  });

  it("retorna 400 quando profileType é inválido", async () => {
    const req = jsonRequest({
      token: "abc123",
      phone: "48999998888",
      profileType: "astronauta",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/perfil|válid/i);
  });

  it("aceita profileType default (modo normal) e grava bot_config", async () => {
    const supabase = mockSupabaseActivate();
    createAdminClient.mockReturnValue(supabase);
    const expected = normalizeBotConfig({ profileType: "default" });
    const req = jsonRequest({
      token: "abc123",
      phone: "48999998888",
      profileType: "default",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(supabase.authorizedUpsertMock).toHaveBeenCalledWith(
      { phone: "5548999998888", bot_config: expected },
      { onConflict: "phone" },
    );
  });

  it("retorna 500 quando update do token falha", async () => {
    createAdminClient.mockReturnValue(
      mockSupabaseActivate({ updateError: { message: "db error" } }),
    );
    const req = jsonRequest({
      token: "abc123",
      phone: "48999998888",
      profileType: validProfile,
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/marcar token|usado/i);
  });

  it("retorna 500 quando insert em authorized_whatsapp_numbers falha", async () => {
    createAdminClient.mockReturnValue(
      mockSupabaseActivate({ insertError: { message: "constraint" } }),
    );
    const req = jsonRequest({
      token: "abc123",
      phone: "48999998888",
      profileType: validProfile,
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/registrar número|autorizado/i);
  });

  it("retorna 200 e ok quando ativação é concluída com sucesso", async () => {
    const req = jsonRequest({
      token: "abc123",
      phone: "48999998888",
      profileType: validProfile,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("aceita phone com formatação e normaliza para 55 + DDD + número", async () => {
    const supabase = mockSupabaseActivate();
    createAdminClient.mockReturnValue(supabase);
    const req = jsonRequest({
      token: "abc123",
      phone: "(48) 99999-8888",
      profileType: validProfile,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(supabase.authorizedUpsertMock).toHaveBeenCalledWith(
      { phone: "5548999998888", bot_config: expectedBotConfig },
      { onConflict: "phone" },
    );
  });

  it("retorna 400 quando o corpo não é JSON válido", async () => {
    const req = { json: () => Promise.reject(new SyntaxError("bad json")) } as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/json/i);
  });
});

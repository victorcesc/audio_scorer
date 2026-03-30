/**
 * Testes da API de verificação de número autorizado (registro/consulta).
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

// Token precisa estar definido antes do módulo da rota ser carregado (ele lê process.env na carga)
process.env.AUDIO_SCORER_BOT_TOKEN = "secret-bot-token";

const { GET } = require("../route");
const createAdminClient = require("@/lib/supabase/admin").createAdminClient as jest.Mock;

function mockSupabaseCheckAuthorized(overrides: {
  authorizedRow?: { phone: string } | null;
  fetchError?: unknown;
} = {}) {
  const { authorizedRow = null, fetchError = null } = overrides;

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === "authorized_whatsapp_numbers") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue(
              fetchError
                ? { data: null, error: fetchError }
                : { data: authorizedRow, error: null },
            ),
          }),
        }),
      };
    }
    if (table === "activation_tokens") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });

  return { from };
}

function requestWithQueryAndHeaders(phone: string | null, botToken: string | null) {
  const url = new URL("http://localhost/api/bot/check-authorized");
  if (phone != null) url.searchParams.set("phone", phone);
  return {
    nextUrl: url,
    headers: {
      get: (name: string) => {
        const n = name.toLowerCase();
        if (n === "x-bot-token") return botToken;
        return null;
      },
    },
  } as any;
}

describe("GET /api/bot/check-authorized", () => {
  beforeEach(() => {
    createAdminClient.mockReturnValue(mockSupabaseCheckAuthorized());
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("retorna 401 quando x-bot-token não é enviado", async () => {
    const req = requestWithQueryAndHeaders("5548999998888", null);
    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Não autorizado.");
  });

  it("retorna 401 quando x-bot-token não confere com AUDIO_SCORER_BOT_TOKEN", async () => {
    const req = requestWithQueryAndHeaders("5548999998888", "wrong-token");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Não autorizado.");
  });

  it("retorna 400 quando query phone está ausente", async () => {
    const req = requestWithQueryAndHeaders(null, "secret-bot-token");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/phone|parâmetro|obrigatório/i);
  });

  it("retorna 200 com authorized: false quando número não está na base", async () => {
    const req = requestWithQueryAndHeaders("5548999998888", "secret-bot-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authorized).toBe(false);
  });

  it("retorna 200 com authorized: true quando número está na base", async () => {
    createAdminClient.mockReturnValue(
      mockSupabaseCheckAuthorized({ authorizedRow: { phone: "5548999998888" } }),
    );
    const req = requestWithQueryAndHeaders("5548999998888", "secret-bot-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authorized).toBe(true);
  });

  it("retorna authorized: false em caso de erro no Supabase", async () => {
    createAdminClient.mockReturnValue(
      mockSupabaseCheckAuthorized({ fetchError: { message: "db error" } }),
    );
    const req = requestWithQueryAndHeaders("5548999998888", "secret-bot-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authorized).toBe(false);
  });

  it("aceita header x-bot-token (case-insensitive no nome)", async () => {
    const req = requestWithQueryAndHeaders("5548999998888", "secret-bot-token");
    (req.headers as any).get = (name: string) =>
      name.toLowerCase() === "x-bot-token" ? "secret-bot-token" : null;
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

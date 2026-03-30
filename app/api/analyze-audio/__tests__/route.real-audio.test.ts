/**
 * Testes que usam o áudio de exemplo em audios/teste_1.ogg para garantir
 * que o pipeline aceita e processa o arquivo real (com mocks de OpenAI/Supabase).
 */
import * as fs from "fs";
import * as path from "path";
import { POST } from "../route";

jest.mock("next/server", () => ({
  NextRequest: function () {},
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockTranscript = "Lead quer apartamento de 3 quartos no Centro, orçamento até 800 mil.";
const mockQualification = {
  summary: "Cliente quer apartamento 3 quartos no Centro, orçamento até R$ 800k, pressa alta.",
  score: 8,
  bantReasons: "Budget definido, necessidade clara, urgência.",
  nextStep: "Agendar visita para sábado.",
};

jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue(mockTranscript),
      },
    },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify(mockQualification),
              },
            },
          ],
        }),
      },
    },
  }));
});

const mockNextRequest = (formData: FormData) => ({
  formData: () => Promise.resolve(formData),
});

const EXAMPLE_AUDIO_PATH = path.join(process.cwd(), "audios", "teste_1.ogg");

function buildRequestWithRealFile(): { formData: FormData; request: ReturnType<typeof mockNextRequest> } | null {
  if (!fs.existsSync(EXAMPLE_AUDIO_PATH)) return null;
  const buffer = fs.readFileSync(EXAMPLE_AUDIO_PATH);
  const uint8 = new Uint8Array(buffer);
  const file = new File([uint8], "teste_1.ogg", { type: "audio/ogg" });
  if (typeof (file as any).arrayBuffer !== "function") {
    (file as any).arrayBuffer = () => Promise.resolve(uint8.buffer.slice(0));
  }
  const formData = new FormData();
  formData.set("audio", file);
  return { formData, request: mockNextRequest(formData) };
}

describe("POST /api/analyze-audio (áudio real audios/teste_1.ogg)", () => {
  const env = process.env;
  const { createClient } = require("@/lib/supabase/server") as {
    createClient: jest.Mock;
  };

  const mockSupabase = () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "user-real-audio-test" } },
      }),
    },
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0 }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: "lead-real-1",
                  summary: mockQualification.summary,
                  score: mockQualification.score,
                  next_step: mockQualification.nextStep,
                  created_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { subscription_status: "free" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  });

  beforeEach(() => {
    process.env = { ...env, OPENAI_API_KEY: "sk-test" };
    createClient.mockResolvedValue(mockSupabase());
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = env;
  });

  it("aceita e processa o arquivo OGG de exemplo (audios/teste_1.ogg)", async () => {
    const built = buildRequestWithRealFile();
    if (!built) {
      console.warn("Arquivo audios/teste_1.ogg não encontrado; teste ignorado.");
      return;
    }

    const res = await POST(built.request as any);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("transcript");
    expect(data).toHaveProperty("summary");
    expect(data).toHaveProperty("score");
    expect(data).toHaveProperty("nextStep");

    expect(typeof data.transcript).toBe("string");
    expect(data.transcript.length).toBeGreaterThan(0);
    expect(typeof data.summary).toBe("string");
    expect(typeof data.score).toBe("number");
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(10);
    expect(typeof data.nextStep).toBe("string");
  });

  it("retorna transcrição e qualificação com formato esperado ao processar áudio real", async () => {
    const built = buildRequestWithRealFile();
    if (!built) return;

    const res = await POST(built.request as any);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Com nossos mocks, a resposta deve refletir mockTranscript e mockQualification
    expect(data.transcript).toBe(mockTranscript);
    expect(data.summary).toBe(mockQualification.summary);
    expect(data.score).toBe(mockQualification.score);
    expect(data.nextStep).toBe(mockQualification.nextStep);
  });
});

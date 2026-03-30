/**
 * API route tests. next/server is mocked so we never need Request/FormData from undici.
 * Node 18+ provides global FormData and File.
 * A rota não usa mais auth/Supabase; apenas valida o arquivo e chama analyzeAudioBuffer.
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

const mockAnalyzeAudioBuffer = jest.fn();

/** Réplica da lógica de isAllowedAudioType para o mock (evita carregar openai no teste). */
function mockIsAllowedAudioType(mimeType: string, fileName: string): boolean {
  const allowed = ["mpeg", "mp3", "ogg", "webm", "wav"];
  const typeOk = allowed.some((s) => mimeType.toLowerCase().includes(s));
  const extOk = /\.(mp3|ogg|webm|wav|mpeg)$/i.test(fileName);
  return typeOk || extOk;
}

jest.mock("@/lib/analyze-audio", () => ({
  analyzeAudioBuffer: (...args: unknown[]) => mockAnalyzeAudioBuffer(...args),
  isAllowedAudioType: mockIsAllowedAudioType,
  MAX_AUDIO_SIZE_BYTES: 25 * 1024 * 1024,
}));

import { POST } from "../route";

const defaultResult = {
  transcript: "Transcrição de teste do lead.",
  qualification: {
    summary: "Cliente quer apartamento 3 quartos, orçamento R$ 800k.",
    score: 8,
    bantReasons: "Budget claro, necessidade definida.",
    nextStep: "Agendar visita.",
  },
};

const mockNextRequest = (formData: FormData) => ({
  formData: () => Promise.resolve(formData),
});

function formRequestWithFile(
  fileName: string,
  type: string,
  size: number,
): ReturnType<typeof mockNextRequest> {
  const formData = new FormData();
  const content = new Uint8Array(Buffer.from("audio content"));
  const file = new File([content], fileName, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  if (typeof (file as any).arrayBuffer !== "function") {
    (file as any).arrayBuffer = () => Promise.resolve(content.buffer.slice(0));
  }
  formData.set("audio", file);
  return mockNextRequest(formData);
}

describe("POST /api/analyze-audio", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, OPENAI_API_KEY: "sk-test" };
    mockAnalyzeAudioBuffer.mockClear();
    mockAnalyzeAudioBuffer.mockResolvedValue(defaultResult);
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = env;
  });

  it("returns 400 when no audio file is sent", async () => {
    const req = mockNextRequest(new FormData());
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/audio|arquivo/i);
  });

  it("returns 400 when file type is not allowed", async () => {
    const req = formRequestWithFile("file.pdf", "application/pdf", 1000);
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/formato|suportado/i);
  });

  it("returns 400 when file is too large", async () => {
    const req = formRequestWithFile("big.mp3", "audio/mpeg", 26 * 1024 * 1024);
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/grande|25MB/i);
  });

  it("returns 200 with transcript and qualification on success", async () => {
    const req = formRequestWithFile("lead.ogg", "audio/ogg", 500);
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcript).toBe("Transcrição de teste do lead.");
    expect(data.summary).toContain("apartamento");
    expect(data.score).toBe(8);
    expect(data.nextStep).toBe("Agendar visita.");
    expect(data.bantReasons).toBeDefined();
    expect(data).not.toHaveProperty("lead");
  });

  it("calls analyzeAudioBuffer with buffer, type and filename", async () => {
    const req = formRequestWithFile("lead.ogg", "audio/ogg", 500);
    await POST(req as any);
    expect(mockAnalyzeAudioBuffer).toHaveBeenCalledTimes(1);
    const [buffer, mimeType, fileName] = mockAnalyzeAudioBuffer.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mimeType).toBe("audio/ogg");
    expect(fileName).toBe("lead.ogg");
  });

  it("returns 502 when analyzeAudioBuffer throws Invalid qualification JSON shape", async () => {
    mockAnalyzeAudioBuffer.mockRejectedValueOnce(
      new Error("Invalid qualification JSON shape"),
    );
    const req = formRequestWithFile("test.mp3", "audio/mpeg", 1000);
    const res = await POST(req as any);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/formato inválido/i);
  });

  it("returns 500 when analyzeAudioBuffer throws generic error", async () => {
    mockAnalyzeAudioBuffer.mockRejectedValueOnce(new Error("Unexpected failure"));
    const req = formRequestWithFile("test.mp3", "audio/mpeg", 1000);
    const res = await POST(req as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

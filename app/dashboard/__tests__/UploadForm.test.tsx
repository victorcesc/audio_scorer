import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadForm from "../UploadForm";

const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

describe("UploadForm", () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear();
    global.fetch = jest.fn();
  });

  it("shows error when submitting without file", async () => {
    const user = userEvent.setup();
    render(<UploadForm />);
    const button = screen.getByRole("button", { name: /analisar áudio/i });
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByText(/selecione um arquivo/i)).toBeInTheDocument();
    });
  });

  it("shows loading state and calls API when file is selected and submitted", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        lead: { id: "1" },
        transcript: "Ok",
        summary: "S",
        score: 7,
        nextStep: "N",
      }),
    });

    const user = userEvent.setup();
    render(<UploadForm />);

    const input = screen.getByLabelText(/arquivo/i);
    const file = new File(["audio"], "test.mp3", { type: "audio/mpeg" });
    await user.upload(input, file);

    const button = screen.getByRole("button", { name: /analisar áudio/i });
    await user.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/analyze-audio", {
        method: "POST",
        body: expect.any(FormData),
      });
    });
    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });

  it("shows upgrade CTA when API returns 402 LIMIT_REACHED", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        error: "Limite de áudios gratuitos atingido. Assine para continuar.",
        code: "LIMIT_REACHED",
      }),
    });

    const user = userEvent.setup();
    render(<UploadForm />);

    const input = screen.getByLabelText(/arquivo/i);
    await user.upload(input, new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    await user.click(screen.getByRole("button", { name: /analisar áudio/i }));

    await waitFor(() => {
      expect(screen.getByText(/limite de áudios gratuitos/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /assinar agora/i })).toBeInTheDocument();
    });
  });

  it("shows generic error when API returns 400", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Formato não suportado." }),
    });

    const user = userEvent.setup();
    render(<UploadForm />);
    await user.upload(
      screen.getByLabelText(/arquivo/i),
      new File(["x"], "a.mp3", { type: "audio/mpeg" })
    );
    await user.click(screen.getByRole("button", { name: /analisar áudio/i }));

    await waitFor(() => {
      expect(screen.getByText(/formato não suportado/i)).toBeInTheDocument();
    });
  });
});

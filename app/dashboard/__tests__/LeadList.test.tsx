import { render, screen } from "@testing-library/react";
import LeadList from "../LeadList";

describe("LeadList", () => {
  it("shows empty message when no leads", () => {
    render(<LeadList leads={[]} />);
    expect(
      screen.getByText(/nenhum áudio analisado ainda/i)
    ).toBeInTheDocument();
  });

  it("renders lead cards with summary, score and next step", () => {
    const leads = [
      {
        id: "1",
        summary: "Cliente quer apartamento 3 quartos no Centro.",
        score: 8,
        next_step: "Agendar visita sábado",
        created_at: "2024-06-01T12:00:00Z",
      },
      {
        id: "2",
        summary: "Lead frio, só curiosidade.",
        score: 2,
        next_step: "Descartar (fora de perfil)",
        created_at: "2024-06-02T10:00:00Z",
      },
    ];
    render(<LeadList leads={leads} />);

    expect(screen.getByText(/Cliente quer apartamento 3 quartos/)).toBeInTheDocument();
    expect(screen.getByText(/Lead frio, só curiosidade/)).toBeInTheDocument();
    expect(screen.getByText(/Score: 8\/10/)).toBeInTheDocument();
    expect(screen.getByText(/Score: 2\/10/)).toBeInTheDocument();
    expect(screen.getByText(/Agendar visita sábado/)).toBeInTheDocument();
    expect(screen.getByText(/Descartar \(fora de perfil\)/)).toBeInTheDocument();
  });

  it("renders list with correct number of items", () => {
    const leads = [
      {
        id: "a",
        summary: "A",
        score: 5,
        next_step: "N1",
        created_at: "2024-01-01T00:00:00Z",
      },
    ];
    render(<LeadList leads={leads} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("N1")).toBeInTheDocument();
  });
});

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audio Scorer — Qualificador de Leads",
  description: "Envie áudios de leads e receba resumo, score BANT e próximo passo em segundos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecione um arquivo de áudio.");
      return;
    }
    setError(null);
    setShowUpgrade(false);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("audio", file);

      const res = await fetch("/api/analyze-audio", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.status === 402 && data.code === "LIMIT_REACHED") {
        setShowUpgrade(true);
        setError(data.error ?? "Limite de áudios gratuitos atingido.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Erro ao processar áudio.");
        return;
      }

      setFile(null);
      router.refresh();
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade() {
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError("Erro ao abrir página de pagamento.");
    } catch {
      setError("Erro ao abrir página de pagamento.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-sm font-semibold">Enviar áudio</h2>
        <p className="text-xs text-muted-foreground">
          MP3, OGG, WebM ou WAV. Máximo 25MB. Áudios de 1 min podem levar 15–45 segundos.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="audio">Arquivo</Label>
            <Input
              id="audio"
              type="file"
              accept=".mp3,.ogg,.webm,.wav,.mpeg,audio/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
                setShowUpgrade(false);
              }}
              className="cursor-pointer"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Processando… aguarde (pode levar até 1 min)" : "Analisar áudio"}
          </Button>
        </form>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {showUpgrade && (
          <div className="rounded-md border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium">Quer analisar mais áudios?</p>
            <Button onClick={handleUpgrade} size="sm">
              Assinar agora
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

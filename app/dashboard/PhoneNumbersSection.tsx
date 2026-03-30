"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  digitsBrazilianNationalFromInput,
  formatBrazilianPhoneForDisplay,
  validateBrazilianPhone,
} from "@/lib/phone";
import {
  ACTIVATION_PROFESSION_OPTIONS,
  type ActivationProfessionSlug,
} from "@/lib/activation-professions";

export type WhatsappNumberRow = {
  phone: string;
  audio_analyzed_count: number;
};

export default function PhoneNumbersSection({
  numbers,
}: {
  numbers: WhatsappNumberRow[];
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [profileType, setProfileType] = useState<ActivationProfessionSlug | "">("");
  const [professionTouched, setProfessionTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [removingPhone, setRemovingPhone] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const phoneValidation = validateBrazilianPhone(phone);
  const showPhoneError = phoneTouched && !phoneValidation.valid;
  const showProfessionError = professionTouched && !profileType;

  async function handleAddNumber(e: React.FormEvent) {
    e.preventDefault();
    setPhoneTouched(true);
    setProfessionTouched(true);
    setMessage("");
    if (!profileType) {
      setMessage("Escolha o perfil do bot (ou modo normal).");
      setStatus("error");
      return;
    }
    const validation = validateBrazilianPhone(phone);
    if (!validation.valid) {
      setMessage(validation.error);
      setStatus("error");
      return;
    }
    const onlyDigits = digitsBrazilianNationalFromInput(phone);
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/whatsapp-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: onlyDigits,
          profileType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Não foi possível cadastrar o número.");
        setStatus("error");
        return;
      }
      setPhone("");
      setPhoneTouched(false);
      setProfessionTouched(false);
      setProfileType("");
      setStatus("success");
      setMessage("Número cadastrado. Você já pode usar o bot no WhatsApp.");
      router.refresh();
    } catch {
      setMessage("Erro de conexão. Tente novamente.");
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveNumber(canonicalPhone: string) {
    const ok = window.confirm(
      "Remover este número? O bot deixará de aceitar este WhatsApp até você cadastrar de novo. Você pode registrar o mesmo número outra vez depois."
    );
    if (!ok) return;
    setRemovingPhone(canonicalPhone);
    setMessage("");
    try {
      const res = await fetch("/api/user/whatsapp-numbers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: canonicalPhone }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Não foi possível remover o número.");
        setStatus("error");
        return;
      }
      setStatus("success");
      setMessage("Número removido. Você pode cadastrar outro ou o mesmo de novo abaixo.");
      router.refresh();
    } catch {
      setMessage("Erro de conexão. Tente novamente.");
      setStatus("error");
    } finally {
      setRemovingPhone(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-semibold">Números no WhatsApp</h2>
          <p className="text-xs text-muted-foreground">
            Cada número cadastrado pode enviar áudios ao bot. A contagem abaixo reflete os áudios
            processados em lotes pelo bot (um lote pode ter vários áudios). Você pode{" "}
            <strong>remover</strong> um número para cadastrar de novo (mesmo telefone ou outro).
          </p>
        </CardHeader>
        <CardContent>
          {message && (
            <p
              className={`text-sm mb-4 ${
                status === "success" ? "text-green-800" : "text-destructive"
              }`}
              role={status === "error" ? "alert" : undefined}
            >
              {message}
            </p>
          )}
          {numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">
              Você ainda não cadastrou nenhum número. Use o formulário abaixo para autorizar seu
              WhatsApp.
            </p>
          ) : (
            <ul className="space-y-3 mb-4">
              {numbers.map((n) => (
                <li
                  key={n.phone}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="font-medium tabular-nums block">
                      {formatBrazilianPhoneForDisplay(n.phone)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {n.audio_analyzed_count}{" "}
                      {n.audio_analyzed_count === 1
                        ? "áudio processado pelo bot"
                        : "áudios processados pelo bot"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                    disabled={removingPhone !== null}
                    onClick={() => handleRemoveNumber(n.phone)}
                  >
                    {removingPhone === n.phone ? "Removendo…" : "Remover"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddNumber} className="space-y-4 border-t pt-4">
            <p className="text-sm font-medium">
              {numbers.length === 0 ? "Cadastrar número" : "Cadastrar outro número"}
            </p>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground mb-2">
                Perfil / segmento
              </legend>
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                {ACTIVATION_PROFESSION_OPTIONS.map((opt) => (
                  <label key={opt.slug} className="flex gap-2 cursor-pointer items-start text-sm">
                    <input
                      type="radio"
                      name="profession"
                      value={opt.slug}
                      checked={profileType === opt.slug}
                      onChange={() => {
                        setProfileType(opt.slug);
                        if (message) setMessage("");
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{opt.title}</span>
                      <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {showProfessionError && (
                <p className="text-xs text-destructive" role="alert">
                  Escolha uma das opções acima.
                </p>
              )}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="dash-phone">Número do WhatsApp</Label>
              <Input
                id="dash-phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (message) setMessage("");
                }}
                onBlur={() => setPhoneTouched(true)}
                placeholder="(48) 99999-8888"
                autoComplete="tel"
                aria-invalid={showPhoneError}
              />
              {showPhoneError && (
                <p className="text-xs text-destructive" role="alert">
                  {phoneValidation.error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Com DDD. O código 55 é aplicado automaticamente se necessário.
              </p>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar número"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

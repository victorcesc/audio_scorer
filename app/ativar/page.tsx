"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { digitsBrazilianNationalFromInput, validateBrazilianPhone } from "@/lib/phone";
import {
  ACTIVATION_PROFESSION_OPTIONS,
  type ActivationProfessionSlug,
} from "@/lib/activation-professions";

function AtivarForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [profileType, setProfileType] = useState<ActivationProfessionSlug | "">("");
  const [professionTouched, setProfessionTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const phoneValidation = validateBrazilianPhone(phone);
  const showPhoneError = phoneTouched && !phoneValidation.valid;
  const showProfessionError = professionTouched && !profileType;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhoneTouched(true);
    setProfessionTouched(true);
    if (!token.trim()) {
      setMessage("Preencha o token.");
      setStatus("error");
      return;
    }
    if (!profileType) {
      setMessage(
        "Selecione uma opção: profissão específica ou “Nenhuma profissão” para o modo normal do bot."
      );
      setStatus("error");
      return;
    }
    if (!phone.trim()) {
      setMessage("Digite o número com DDD.");
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
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          phone: onlyDigits,
          profileType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Falha ao ativar. Verifique o token e tente novamente.");
        setStatus("error");
        return;
      }
      setMessage("Ativação concluída. Você já pode usar o bot no WhatsApp.");
      setStatus("success");
    } catch {
      setMessage("Erro de conexão. Tente novamente.");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-2">Ativar acesso ao Audio Scorer</h1>
      <p className="text-gray-600 text-center mb-6 max-w-md">
        Use o link que você recebeu (com token), escolha sua área de atuação e informe seu número de WhatsApp para
        ser autorizado a usar o bot. Você poderá alterar o perfil e o formato da resposta depois pelo WhatsApp (e no
        futuro pelo painel).
      </p>
      <p className="text-sm text-gray-500 text-center mb-6 max-w-md">
        Se você já tem conta no site, pode cadastrar o número no painel após entrar — nesse caso não precisa de token.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
            Token (ou use o link que você recebeu)
          </label>
          <input
            id="token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token de ativação"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            autoComplete="off"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="block text-sm font-medium text-gray-700 mb-2">
            Profissão / segmento (ou modo normal)
          </legend>
          <p className="text-xs text-gray-500 mb-2">
            O <strong>modo normal</strong> usa o perfil genérico (<code className="text-xs">default</code>). Com uma
            profissão, a análise inclui dois focos extras alinhados ao segmento. Score, BANT, focos e transcrição
            continuam ajustáveis no WhatsApp.
          </p>
          <div className="space-y-3 rounded-md border border-gray-200 p-3 bg-gray-50/80">
            {ACTIVATION_PROFESSION_OPTIONS.map((opt, index) => (
              <label
                key={opt.slug}
                className="flex gap-3 cursor-pointer items-start text-sm text-gray-800"
              >
                <input
                  type="radio"
                  name="profession"
                  value={opt.slug}
                  checked={profileType === opt.slug}
                  onChange={() => {
                    setProfileType(opt.slug);
                    if (message && status === "error") setMessage("");
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">
                    {index + 1}. {opt.title}
                  </span>
                  <span className="block text-xs text-gray-600 mt-0.5">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {showProfessionError && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              Escolha uma das opções acima (incluindo modo normal).
            </p>
          )}
        </fieldset>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Número do WhatsApp
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (message && status === "error") setMessage("");
            }}
            onBlur={() => setPhoneTouched(true)}
            placeholder="(48) 99999-8888"
            className={`w-full px-3 py-2 border rounded-md ${
              showPhoneError ? "border-red-500 focus:ring-red-500" : "border-gray-300"
            }`}
            autoComplete="tel"
            maxLength={28}
            aria-invalid={showPhoneError}
            aria-describedby={showPhoneError ? "phone-error" : "phone-hint"}
          />
          {showPhoneError && !phoneValidation.valid && (
            <p id="phone-error" className="mt-1 text-xs text-red-600" role="alert">
              {phoneValidation.error}
            </p>
          )}
          <p id="phone-hint" className="mt-1 text-xs text-gray-500">
            Digite com código de área. Ex: (XX) 9XXXX-XXXX. Apenas números também serve: 48999998888. O código do país (55) é adicionado automaticamente.
          </p>
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "loading" ? "Ativando..." : "Ativar"}
        </button>
      </form>
      {message && (
        <p
          className={`mt-4 text-sm max-w-sm text-center ${
            status === "success" ? "text-green-700" : status === "error" ? "text-red-600" : "text-gray-600"
          }`}
        >
          {message}
        </p>
      )}
      <Link href="/" className="mt-6 text-sm text-gray-500 hover:text-gray-700">
        Voltar ao início
      </Link>
    </main>
  );
}

export default function AtivarPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <p className="text-gray-500">Carregando...</p>
      </main>
    }>
      <AtivarForm />
    </Suspense>
  );
}

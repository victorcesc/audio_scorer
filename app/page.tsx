import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-2">Audio Scorer</h1>
      <p className="text-gray-600 text-center mb-8 max-w-md">
        Envie áudios de leads e receba resumo, score BANT e próximo passo em segundos.
      </p>
      <Link
        href="/dashboard"
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Ir para o dashboard
      </Link>
    </main>
  );
}

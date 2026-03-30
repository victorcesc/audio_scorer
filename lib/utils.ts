import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina e mescla classes CSS (ex.: Tailwind) de forma segura.
 * - Usa `clsx` para aceitar valores condicionais (ex.: `isActive && "bg-blue-500"`).
 * - Usa `twMerge` para resolver conflitos entre classes Tailwind (ex.: "p-2" e "p-4" → fica "p-4").
 *
 * Uso típico em componentes: `className={mergeClassNames("base", variant, className)}`
 */
export function mergeClassNames(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

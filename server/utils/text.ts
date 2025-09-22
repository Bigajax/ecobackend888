export const now = () => Date.now();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mapRoleForOpenAI = (role: string): "user" | "assistant" | "system" =>
  role === "model" ? "assistant" : role === "system" ? "system" : "user";

export const limparResposta = (t: string) =>
  (t || "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/###.*?###/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const formatarTextoEco = (t: string) =>
  (t || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/(?<!\n)\n(?!\n)/g, "\n\n")
    .replace(/^\s+-\s+/gm, "— ")
    .replace(/^\s+/gm, "")
    .trim();

export function ensureEnvs() {
  const required = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`ENVs ausentes: ${missing.join(", ")}`);
}

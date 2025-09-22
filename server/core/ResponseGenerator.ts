import { callOpenRouterChat } from "../adapters/OpenRouterAdapter";
import { limparResposta, formatarTextoEco } from "../utils/text";
import { hedge } from "../policies/hedge";

const MODEL_MAIN     = process.env.ECO_MODEL_MAIN     || "openai/gpt-5-chat";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini";

export async function fastGreet(prompt: string) {
  const lightSystem =
    "Você é a ECO, acolhedora e concisa. Responda em 1–2 frases, em PT-BR, convidando a pessoa a começar. Evite perguntas múltiplas.";
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Fast Lane",
  };
  const data = await callOpenRouterChat(
    { model: MODEL_TECH_ALT, temperature: 0.6, max_tokens: 180, messages: [{ role: "system", content: lightSystem }, { role: "user", content: prompt }] },
    headers, 6000
  );
  const raw = data?.choices?.[0]?.message?.content ?? "Olá! 🙂 Como você quer começar hoje?";
  return formatarTextoEco(limparResposta(raw));
}

export function microReflexoLocal(msg: string): string | null {
  const t = (msg || "").trim().toLowerCase();
  if (/cansad/.test(t)) return "Entendi. Parece que o corpo está pedindo pausa. Quer começar com 1 minuto de respiração ou prefere só desabafar um pouco?";
  if (/ansios/.test(t)) return "Percebo ansiedade aí. Topa notar 3 pontos de apoio do corpo agora e, se quiser, me contar onde ela pega mais?";
  if (/triste/.test(t)) return "Sinto a tristeza chegando. Prefere nomear o que mais doeu ou que eu guie uma micro-pausa?";
  if (/irritad|raiva/.test(t)) return "Raiva é energia. Quer soltar em palavras o gatilho principal, sem filtro, ou tentamos baixar um pouco a ativação primeiro?";
  if (/medo|receio|insegur/.test(t)) return "Tem medo no ar. Podemos mapear rapidamente: 1) o que ameaça, 2) o que te protege, 3) qual seria o próximo passo menor. Topa?";
  return null;
}

export async function chatCompletion(messages: any[], maxTokens: number) {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Chat",
  };
  const main = callOpenRouterChat(
    { model: MODEL_MAIN, messages, temperature: 0.7, top_p: 0.9, presence_penalty: 0.1, frequency_penalty: 0.1, max_tokens: maxTokens },
    headers, 9000
  );
  const mini = callOpenRouterChat(
    { model: MODEL_TECH_ALT, messages, temperature: 0.65, top_p: 0.9, max_tokens: Math.min(420, maxTokens) },
    headers, 5500
  );
  return hedge(main, mini, 2500);
}

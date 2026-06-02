// services/perfilResumoIA.ts
import { claudeChatCompletion, type Msg } from "../core/ClaudeAdapter";

export interface ResumoPerfilInput {
  /** Emoções com frequência (chave normalizada → contagem). */
  emocoesFreq: Record<string, number>;
  /** Temas/domínios de vida com frequência. */
  temasFreq: Record<string, number>;
  /** Total de memórias significativas (intensidade ≥ 7). */
  totalMemorias: number;
  /** ISO da última interação significativa, se houver. */
  ultimaInteracao?: string | null;
}

const SYSTEM_PROMPT = `Você é a Eco, uma presença emocionalmente sensível.
Sua tarefa é escrever um retrato breve e acolhedor do momento emocional de uma pessoa,
a partir de dados agregados das memórias dela.

Diretrizes:
- Fale em segunda pessoa ("você"), com calor humano e sem clínica.
- 2 a 4 frases, no máximo. Sem listas, sem títulos, sem aspas.
- Reflita o padrão sem rotular a pessoa nem diagnosticar.
- Use as emoções e temas mais frequentes como fio condutor.
- Não invente fatos que não estão nos dados. Não cite números nem nomes de campos.
- Português do Brasil, tom sereno e respeitoso.`;

function ordenarPorFrequencia(obj: Record<string, number>): string[] {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

function isEnabled(): boolean {
  // Habilitado por padrão; desligue com ECO_PERFIL_IA_ENABLED=false.
  return process.env.ECO_PERFIL_IA_ENABLED !== "false";
}

function montarPromptUsuario(input: ResumoPerfilInput): string {
  const emocoes = ordenarPorFrequencia(input.emocoesFreq);
  const temas = ordenarPorFrequencia(input.temasFreq);

  const linhas: string[] = [];
  linhas.push(
    `Emoções mais frequentes (da mais à menos): ${emocoes.length ? emocoes.join(", ") : "nenhuma registrada"}.`
  );
  linhas.push(
    `Temas de vida recorrentes: ${temas.length ? temas.join(", ") : "nenhum registrado"}.`
  );
  linhas.push(`Momentos emocionalmente significativos registrados: ${input.totalMemorias}.`);
  if (input.ultimaInteracao) {
    const dia = input.ultimaInteracao.slice(0, 10);
    linhas.push(`Última interação significativa: ${dia}.`);
  }
  linhas.push("");
  linhas.push("Escreva o retrato emocional agora.");
  return linhas.join("\n");
}

/**
 * Gera um resumo narrativo do perfil emocional via Claude.
 * Retorna `null` se desabilitado, sem dados suficientes, ou em qualquer falha
 * (o chamador deve usar o template como fallback).
 */
export async function gerarResumoPerfilIA(
  input: ResumoPerfilInput
): Promise<string | null> {
  if (!isEnabled()) return null;
  if (!process.env.OPENROUTER_API_KEY) return null;

  const temEmocoes = Object.keys(input.emocoesFreq).length > 0;
  const temTemas = Object.keys(input.temasFreq).length > 0;
  if (!temEmocoes && !temTemas) return null;

  const messages: Msg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: montarPromptUsuario(input) },
  ];

  try {
    const { content } = await claudeChatCompletion({
      messages,
      temperature: 0.6,
      maxTokens: 280,
    });

    const resumo = typeof content === "string" ? content.trim() : "";
    if (!resumo) return null;
    return resumo;
  } catch (err: any) {
    if (process.env.ECO_DEBUG === "true") {
      console.warn("[perfilResumoIA] falha ao gerar resumo:", err?.message ?? err);
    }
    return null;
  }
}

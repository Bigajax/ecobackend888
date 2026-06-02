/**
 * Dataset rotulado para calibração de intensidade (Onda 3, parte offline).
 * `estimarIntensidade0a10` é determinística → dá para medir acurácia sem API.
 * Bandas: baixa 0–4 | media 5–6 | alta 7–10. Cada caso fixa [min, max] esperado.
 */
export type Banda = "baixa" | "media" | "alta";

export interface IntensityCase {
  texto: string;
  banda: Banda;
  min: number;
  max: number;
  nota?: string;
}

const B = { baixa: [0, 4], media: [5, 6], alta: [7, 10] } as const;
const mk = (texto: string, banda: Banda, nota?: string): IntensityCase => ({
  texto,
  banda,
  min: B[banda][0],
  max: B[banda][1],
  nota,
});

export const INTENSITY_CASES: IntensityCase[] = [
  // baixa — neutro / prático / factual
  mk("oi, tudo bem?", "baixa"),
  mk("como funciona o sistema?", "baixa"),
  mk("me dá um passo a passo pra organizar minhas tarefas", "baixa"),
  mk("que horas são agora?", "baixa"),
  mk("estou meio cansado hoje", "baixa", "cansaço leve, sem emoção primária forte"),
  mk("não sei se devo pedir demissão", "baixa", "dúvida/decisão sem carga emocional alta"),

  // media — emoção presente, moderada
  mk("estou triste", "media"),
  mk("tenho muito medo disso", "media"),
  mk("estou angustiado com meu relacionamento", "media"),
  mk("ando irritado com tudo ultimamente", "media"),

  // alta — intensidade forte / vulnerabilidade / luto / crise
  mk("estou muito triste hoje", "alta"),
  mk("estou muito triste. do trabalho.", "alta"),
  mk("não aguento mais essa sensação de estar atrasado", "alta"),
  mk("minha mãe faleceu e não consigo lidar com a saudade", "alta", "LUTO — não pode ser subestimado"),
  mk("penso em me matar", "alta", "CRISE — segurança, deve ser sempre alta"),
  mk("não quero mais viver", "alta", "CRISE"),
];

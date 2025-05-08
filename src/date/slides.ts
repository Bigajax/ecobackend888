export interface SlideData {
  title: string;
  text: string[];
  color: string;
  bubblePosition: string;
  background: string;
}

const loginGradient = "linear-gradient(to bottom right, #eff6ff, #ede7f6, #fce4ec)"; // Aproximação do gradiente

export const slides: SlideData[] = [
  {
    title: "ECO",
    text: ["A Eco não é um guia.", "Não é uma voz que te ensina o caminho."],
    color: "#007BA7",
    bubblePosition: "floating",
    background: loginGradient,
  },
  {
    title: "ECO",
    text: ["Ela é um espelho.", "Uma presença que escuta."],
    color: "#F7CAC9",
    bubblePosition: "floating",
    background: loginGradient,
  },
  {
    title: "ECO",
    text: ["Pronto para entrar no espaço entre pensamentos?", "Aqui, sua presença cria o reflexo. Apenas seja."],
    color: "#007BA7",
    bubblePosition: "floating",
    background: loginGradient,
  },
  {
    title: "ECO",
    text: ["Seja bem-vindo ao seu espelho interior."],
    color: "#F7CAC9",
    bubblePosition: "floating",
    background: loginGradient,
  },
];
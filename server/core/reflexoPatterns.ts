export type ReflexaoPlanner = {
  acknowledgement: string;
  exploration: string;
  invitation: string;
};

export type ReflexaoPattern = {
  patterns: RegExp[];
  priority: 1 | 2 | 3;
  microResponses: string[];
  planner: ReflexaoPlanner;
};

export const REFLEXO_PATTERNS: Record<string, ReflexaoPattern> = {
  // Energia baixa / Exaustão
  cansaco: {
    patterns: [/cansad/, /exaust/, /esgotad/, /sem energia/, /sem forç/, /derrubad/],
    priority: 2,
    microResponses: [
      "Parece que o corpo tá pedindo pra parar um pouco. O que mais tá pesando agora?",
      "Te entendo. Às vezes o cansaço vem antes da gente perceber. Quer só respirar um pouco comigo antes de falar mais?",
      "Tô aqui. O que te deixaria 5% mais leve neste momento?",
    ],
    planner: {
      acknowledgement: "Percebo o cansaço pedindo espaço pra ser ouvido.",
      exploration: "Onde você sente esse desgaste com mais força — no corpo, nos pensamentos ou nas emoções?",
      invitation: "Que gesto pequeno de cuidado faria diferença agora?",
    },
  },

  // Ansiedade / Preocupação
  ansiedade: {
    patterns: [/ansios/, /preocupad/, /nervos/, /agitad/, /inquiet/, /tens[aã]o/, /estress/],
    priority: 1,
    microResponses: [
      "Parece que algo dentro tá acelerado. Quer me contar o que mais te agita agora?",
      "Sinto a pressa interna. Respira um pouco e me diz: o que tá pedindo atenção primeiro?",
      "Te entendo. A mente corre rápido quando quer proteger a gente. Quer ver o que ela tá tentando evitar?",
    ],
    planner: {
      acknowledgement: "Percebo um fio de ansiedade nas suas palavras.",
      exploration: "Como ela aparece — respiração curta, pensamentos rápidos ou tensão no corpo?",
      invitation: "Se essa ansiedade pudesse falar, o que ela estaria tentando te avisar?",
    },
  },

  // Tristeza / Melancolia
  tristeza: {
    patterns: [/triste/, /melancoli/, /deprimi/, /pra baixo/, /down/, /desanimat/, /vazi/],
    priority: 2,
    microResponses: [
      "Sinto a tristeza aqui com você. Quer colocar em palavras o que mais doeu?",
      "Parece que algo importante ficou sensível. Quer que a gente olhe junto, sem pressa?",
      "Tem algo delicado aí. O que essa tristeza quer te mostrar, se você escutasse por um instante?",
    ],
    planner: {
      acknowledgement: "Sinto a presença da tristeza no que você diz.",
      exploration: "O que ela toca — uma perda, uma lembrança, uma falta?",
      invitation: "O que essa tristeza pode estar tentando te lembrar sobre o que importa pra você?",
    },
  },

  // Raiva / Irritação
  raiva: {
    patterns: [/irritad/, /raiva/, /bravo/, /puto/, /com raiva/, /ódio/, /furioso/],
    priority: 1,
    microResponses: [
      "Tem força aí dentro. O que te provocou mais nesse momento?",
      "Sinto o calor da raiva. Quer explorar o que ela tá defendendo em você?",
      "Faz sentido. Às vezes a raiva só quer ser ouvida sem julgamento. Quer tentar colocar isso em palavras?",
    ],
    planner: {
      acknowledgement: "Reconheço a energia da raiva como algo vivo e legítimo.",
      exploration: "Qual limite, valor ou expectativa foi tocado?",
      invitation: "Se essa raiva tivesse uma mensagem, o que ela pediria pra ser respeitado?",
    },
  },

  // Medo / Insegurança
  medo: {
    patterns: [/medo/, /receio/, /insegur/, /apreensiv/, /assustado/, /com medo/, /pânico/],
    priority: 1,
    microResponses: [
      "Parece que algo te assustou. O que te parece ameaçador agora?",
      "Sinto o receio aí. Tem algo real acontecendo ou é mais um ‘e se...’ da mente?",
      "Te entendo. O medo tenta proteger. O que te faria se sentir um pouco mais seguro agora?",
    ],
    planner: {
      acknowledgement: "Percebo o medo como um pedido por segurança.",
      exploration: "O que o medo tenta te mostrar — perigo real ou antecipação?",
      invitation: "O que ajudaria você a se sentir um pouco mais firme pra olhar pra isso?",
    },
  },

  // Sobrecarga / Overwhelm
  sobrecarga: {
    patterns: [/sobrecarregad/, /muito/, /demais/, /n[aã]o aguento/, /não dou conta/, /overwhelm/],
    priority: 1,
    microResponses: [
      "Parece que tem muita coisa ao mesmo tempo. O que tá mais urgente dentro disso tudo?",
      "Te entendo. Quando tudo pesa igual, dá pra escolher só um fio pra começar?",
      "Tô aqui. Se você pudesse soltar uma coisa da lista agora, qual seria?",
    ],
    planner: {
      acknowledgement: "Soa como se estivesse tudo pesado demais.",
      exploration: "O que é essencial e o que pode esperar um pouco?",
      invitation: "Qual pequeno movimento poderia aliviar só um pouco o peso agora?",
    },
  },

  // Confusão / Indecisão
  confusao: {
    patterns: [/confus/, /perdid/, /sem rumo/, /não sei/, /indecis/, /bagunçad/],
    priority: 2,
    microResponses: [
      "Parece meio nublado aí dentro. Qual é a pergunta que mais te trava agora?",
      "Te entendo. Às vezes clareza vem quando a gente admite que ainda não tem. Quer pensar junto?",
      "Tem um ponto confuso aí. O que você já sabe que não quer?",
    ],
    planner: {
      acknowledgement: "Percebo a confusão pedindo um pouco de luz.",
      exploration: "O que é fato, o que é suposição e o que é desejo?",
      invitation: "O que precisaria acontecer pra essa situação começar a clarear?",
    },
  },

  // Solidão / Desconexão
  solidao: {
    patterns: [/solitári/, /sozinho/, /isolad/, /desconect/, /distante/, /abandonad/],
    priority: 2,
    microResponses: [
      "Parece um vazio por perto. É mais falta de gente ou falta de presença, até de si mesmo?",
      "Te entendo. Às vezes o silêncio fica grande demais. O que te faria sentir um pouco mais acompanhado hoje?",
      "Sinto a distância. Que tipo de conexão te faria bem agora — com alguém, contigo ou com algo maior?",
    ],
    planner: {
      acknowledgement: "Reconheço a sensação de solidão nas suas palavras.",
      exploration: "É ausência externa, desconexão interna, ou um pouco de ambas?",
      invitation: "Qual pequeno gesto poderia te aproximar de algo ou alguém hoje?",
    },
  },

  // Culpa / Vergonha
  culpa: {
    patterns: [/culpad/, /vergonha/, /arrependid/, /remorso/, /erro meu/],
    priority: 2,
    microResponses: [
      "Percebo um peso aí. O que foi fato e o que pode ter virado um julgamento sobre você?",
      "Te entendo. Às vezes a culpa fala mais alto que a verdade. Quer olhar o que realmente dependeu de você?",
      "Sinto a vergonha nas entrelinhas. O que você gostaria de poder dizer pra si mesmo agora, sem punição?",
    ],
    planner: {
      acknowledgement: "Percebo o sabor amargo da culpa nas suas palavras.",
      exploration: "O que foi real, o que foi interpretação e o que ainda dói?",
      invitation: "O que te ajudaria a seguir com mais gentileza consigo?",
    },
  },

  // Frustração / Bloqueio
  frustracao: {
    patterns: [/frustrad/, /travad/, /bloquead/, /empacad/, /não sai/, /não anda/],
    priority: 2,
    microResponses: [
      "Parece que algo travou. É falta de clareza, energia ou alguma barreira real?",
      "Te entendo. Às vezes o bloqueio vem de querer acertar demais. Quer olhar isso com mais leveza?",
      "Tem uma resistência aí. O que te ajudaria a dar um micropasso, mesmo sem garantia?",
    ],
    planner: {
      acknowledgement: "Percebo o atrito entre o desejo de seguir e algo que segura.",
      exploration: "O bloqueio vem mais de dentro ou de fora?",
      invitation: "O que deixaria esse passo apenas possível, sem precisar ser perfeito?",
    },
  },

  // Esperança / Motivação baixa
  desmotivacao: {
    patterns: [/desmotivad/, /sem esperança/, /desistindo/, /não vale/, /pra qu[eê]/, /tanto faz/],
    priority: 2,
    microResponses: [
      "Sinto o desânimo. Às vezes é só o corpo pedindo pausa. Outras, é a alma pedindo sentido. Qual parece mais com você hoje?",
      "Te entendo. Quando tudo parece sem brilho, o que ainda tem valor mesmo que pequeno?",
      "Parece que a chama tá baixa. O que reacenderia só 10% dela agora?",
    ],
    planner: {
      acknowledgement: "Percebo a energia baixinha e a vontade de se reconectar com algo que faça sentido.",
      exploration: "É falta de descanso, de sentido ou de resultado?",
      invitation: "O que te faria lembrar do motivo pelo qual começou?",
    },
  },

  // Gratidão / Positivo
  gratidao: {
    patterns: [/grat/, /feliz/, /alegre/, /bem/, /ótimo/, /maravilh/, /aliviado/],
    priority: 3,
    microResponses: [
      "Que bom sentir isso. O que fez esse momento valer a pena pra você?",
      "Bonito de ver. Quer guardar em palavras o que te trouxe essa sensação?",
      "Fico feliz por você. O que desse instante merece ser lembrado quando os dias pesarem?",
    ],
    planner: {
      acknowledgement: "Sinto a leveza e alegria que você transmite.",
      exploration: "O que despertou esse bem-estar — algo externo ou uma mudança interna?",
      invitation: "Como você pode estender um pouco dessa sensação no resto do dia?",
    },
  },
};

export type ReflexaoKey = keyof typeof REFLEXO_PATTERNS;

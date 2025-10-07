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
      "Entendi. Parece que o corpo está pedindo pausa. Quer começar com 1 minuto de respiração ou prefere só desabafar um pouco?",
      "O cansaço chegou forte. Topa fazer um check-in rápido: qual parte do corpo grita mais por descanso?",
      "Percebo a sua exaustão. Antes de mais nada: quando foi a última pausa real? Quer começar com água e 3 respirações profundas?",
    ],
    planner: {
      acknowledgement: "Percebo o peso do cansaço no que você traz.",
      exploration: "Vamos notar onde esse desgaste aparece — no corpo, na mente ou nas emoções?",
      invitation: "O que seria um primeiro gesto de cuidado para você agora, mesmo que pequeno?",
    },
  },

  // Ansiedade / Preocupação
  ansiedade: {
    patterns: [/ansios/, /preocupad/, /nervos/, /agitad/, /inquiet/, /tens[aã]o/, /estress/],
    priority: 1,
    microResponses: [
      "Percebo ansiedade aí. Topa notar 3 pontos de apoio do corpo agora e, se quiser, me contar onde ela pega mais?",
      "A ansiedade está alta. Vamos tentar: nome 5 coisas que você vê, 4 que você toca, 3 que você ouve. Ou prefere falar primeiro?",
      "Sinto a tensão. Quer soltar em palavras o que mais preocupa, ou começamos baixando a ativação do corpo?",
    ],
    planner: {
      acknowledgement: "Percebo um fio de ansiedade no que você descreve.",
      exploration: "Que tal observar por um instante como ela se manifesta — na respiração, nos pensamentos ou no corpo?",
      invitation: "Se essa ansiedade pudesse falar, o que ela gostaria que você soubesse agora?",
    },
  },

  // Tristeza / Melancolia
  tristeza: {
    patterns: [/triste/, /melancoli/, /deprimi/, /pra baixo/, /down/, /desanimat/, /vazi/],
    priority: 2,
    microResponses: [
      "Sinto a tristeza chegando. Prefere nomear o que mais doeu ou que eu guie uma micro-pausa?",
      "A tristeza pede espaço. Topa dar nome ao que tá pesando e depois a gente vê o que fazer com isso?",
      "Percebo o peso. Quer escrever livremente sobre o que tá sentindo ou prefere uma presença quieta por um minuto?",
    ],
    planner: {
      acknowledgement: "Sinto a presença de tristeza nas suas palavras.",
      exploration: "Vamos olhar com cuidado para o que ela quer mostrar — há um fato, uma falta, uma memória pedindo atenção?",
      invitation: "O que essa tristeza revela sobre o que é importante para você neste momento?",
    },
  },

  // Raiva / Irritação
  raiva: {
    patterns: [/irritad/, /raiva/, /bravo/, /puto/, /com raiva/, /ódio/, /furioso/],
    priority: 1,
    microResponses: [
      "Raiva é energia. Quer soltar em palavras o gatilho principal, sem filtro, ou tentamos baixar um pouco a ativação primeiro?",
      "Sinto a irritação. Topa nomear: o que foi a gota d'água? E o que você gostaria de fazer com essa energia?",
      "A raiva tem mensagem. Quer descarregar aqui primeiro ou já mapear o que ela tá protegendo?",
    ],
    planner: {
      acknowledgement: "Reconheço a faísca de raiva que apareceu por aqui.",
      exploration: "Vamos identificar o que foi tocado em você — limite, injustiça, expectativa quebrada?",
      invitation: "Se essa raiva estivesse defendendo algo precioso, o que seria?",
    },
  },

  // Medo / Insegurança
  medo: {
    patterns: [/medo/, /receio/, /insegur/, /apreensiv/, /assustado/, /com medo/, /pânico/],
    priority: 1,
    microResponses: [
      "Tem medo no ar. Podemos mapear rapidamente: 1) o que ameaça, 2) o que te protege, 3) qual seria o próximo passo menor. Topa?",
      "O medo apareceu. Primeiro: você está seguro agora? Depois a gente nomeia do que é o medo e o que fazer com ele.",
      "Percebo a insegurança. Quer identificar se é medo real ou ansiedade do 'e se'? Te ajudo a separar os dois.",
    ],
    planner: {
      acknowledgement: "Percebo medo ou insegurança pulsando no que você disse.",
      exploration: "Vamos checar juntos: há um risco real agora ou principalmente cenários imaginados?",
      invitation: "O que ajudaria você a se sentir um pouco mais seguro para olhar para isso com clareza?",
    },
  },

  // Sobrecarga / Overwhelm
  sobrecarga: {
    patterns: [/sobrecarregad/, /muito/, /demais/, /n[aã]o aguento/, /não dou conta/, /overwhelm/],
    priority: 1,
    microResponses: [
      "Sobrecarga detectada. Vamos fazer um 'dump cerebral'? Lista tudo sem ordem, depois a gente organiza o que é urgente de verdade.",
      "Parece que tá sendo demais. Topa fazer um inventário: 1) o que é urgente real, 2) o que é só barulho, 3) o que pode esperar?",
      "Entendo. Muita coisa junto. Quer começar escolhendo UMA coisa pra resolver agora, ou precisa desabafar tudo primeiro?",
    ],
    planner: {
      acknowledgement: "Soa como se estivesse tudo pesado demais ao mesmo tempo.",
      exploration: "Vamos mapear o território: o que é urgente real, o que é barulho e o que pode esperar um pouco?",
      invitation: "Qual pequeno passo faria diferença para aliviar 5% desse acúmulo agora?",
    },
  },

  // Confusão / Indecisão
  confusao: {
    patterns: [/confus/, /perdid/, /sem rumo/, /não sei/, /indecis/, /bagunçad/],
    priority: 2,
    microResponses: [
      "Percebo a confusão. Vamos clarear: qual a pergunta principal que tá presa aí? Às vezes só nomear já ajuda.",
      "Tá nebuloso. Topa fazer um exercício? Completa: 'Eu estaria mais claro se...' e vê o que vem.",
      "A indecisão tem espaço. Quer listar prós/contras ou prefere explorar o que você realmente quer por baixo disso?",
    ],
    planner: {
      acknowledgement: "Ouço bastante névoa aí dentro, como se nada encaixasse direito.",
      exploration: "Vamos separar o que é fato, suposição e desejo pra ver onde a clareza pode surgir?",
      invitation: "Qual pergunta merece ser respondida primeiro para você se orientar melhor?",
    },
  },

  // Solidão / Desconexão
  solidao: {
    patterns: [/solitári/, /sozinho/, /isolad/, /desconect/, /distante/, /abandonad/],
    priority: 2,
    microResponses: [
      "Sinto a solidão. Ela é física (falta de gente) ou emocional (mesmo perto de outros)? Isso muda o caminho.",
      "A desconexão pesa. Topa identificar: com quem/o quê você sente falta de conexão? Pessoas, você mesmo, propósito?",
      "Percebo o isolamento. Quer começar reconectando com você mesmo aqui (eu te acompanho) ou prefere pensar em pontes pra fora?",
    ],
    planner: {
      acknowledgement: "Reconheço uma sensação de solidão ou desconexão no que você traz.",
      exploration: "Vamos explorar se é falta de presença externa, de vínculo interno ou das duas coisas?",
      invitation: "Que tipo de conexão seu coração está pedindo agora — consigo mesmo, com alguém ou com um sentido maior?",
    },
  },

  // Culpa / Vergonha
  culpa: {
    patterns: [/culpad/, /vergonha/, /arrependid/, /remorso/, /erro meu/],
    priority: 2,
    microResponses: [
      "Tem culpa no ar. Vamos separar: foi erro seu mesmo ou você tá carregando peso que não é seu? Faz diferença.",
      "A culpa apareceu. Topa um exercício? 1) O que aconteceu (fatos), 2) O que você podia controlar de verdade, 3) O que fazer agora.",
      "Percebo vergonha. Ela costuma distorcer. Quer nomear o que aconteceu sem julgamento, tipo contando pra um amigo?",
    ],
    planner: {
      acknowledgement: "Sinto um gosto de culpa ou vergonha nas suas palavras.",
      exploration: "Vamos separar fatos de interpretações pra entender o que realmente foi sua responsabilidade?",
      invitation: "O que você precisa reconhecer ou reparar para seguir com mais gentileza consigo mesmo?",
    },
  },

  // Frustração / Bloqueio
  frustracao: {
    patterns: [/frustrad/, /travad/, /bloquead/, /empacad/, /não sai/, /não anda/],
    priority: 2,
    microResponses: [
      "Frustração detectada. O que tá travando: falta de clareza, falta de energia ou obstáculo real? Vamos destrinchar.",
      "Percebo o bloqueio. Às vezes ajuda trocar: ao invés de 'por que não consigo?', tenta 'o que eu precisaria pra conseguir?'.",
      "Tá empacado. Topa mudar o ângulo? Me conta: se isso não importasse nada, o que você faria diferente?",
    ],
    planner: {
      acknowledgement: "Vejo uma trava aí, misto de frustração com vontade de avançar.",
      exploration: "Vamos investigar se o bloqueio é falta de clareza, energia ou um obstáculo concreto?",
      invitation: "O que liberaria um pequeno movimento agora — apoio, descanso, nova estratégia?",
    },
  },

  // Esperança / Motivação baixa
  desmotivacao: {
    patterns: [/desmotivad/, /sem esperança/, /desistindo/, /não vale/, /pra qu[eê]/, /tanto faz/],
    priority: 2,
    microResponses: [
      "Percebo a desmotivação. Ela é cansaço (precisa pausa) ou descrença (precisa reconectar com o porquê)? São caminhos diferentes.",
      "A esperança tá baixa. Topa fazer um resgate? Lembra de uma vez que você superou algo difícil - o que te moveu lá?",
      "Sinto o 'pra quê'. Sem pressão: se você tivesse só 10% de energia, no que você investiria? Às vezes o menor passo acorda algo.",
    ],
    planner: {
      acknowledgement: "Percebo a motivação baixinha, quase sem faísca.",
      exploration: "Vamos distinguir se é falta de energia, de sentido ou de resultados visíveis?",
      invitation: "Qual seria um gesto minúsculo que honraria o que importa pra você, mesmo com pouca energia?",
    },
  },

  // Gratidão / Positivo
  gratidao: {
    patterns: [/grat/, /feliz/, /alegre/, /bem/, /ótimo/, /maravilh/, /aliviado/],
    priority: 3,
    microResponses: [
      "Que bom sentir isso! Topa registrar o que está gerando esse bem-estar? Anotar ajuda a voltar aqui quando precisar.",
      "Percebo leveza. Aproveita: o que desse momento você quer guardar ou expandir?",
      "Legal! Quer celebrar isso de alguma forma ou só deixar a sensação acontecer?",
    ],
    planner: {
      acknowledgement: "É bonito sentir a leveza e gratidão que você compartilha.",
      exploration: "Vamos nomear o que exatamente desperta essa sensação para poder revisitá-la depois?",
      invitation: "Como você pode honrar ou expandir esse bem-estar de um jeito simples hoje?",
    },
  },
};

export type ReflexaoKey = keyof typeof REFLEXO_PATTERNS;

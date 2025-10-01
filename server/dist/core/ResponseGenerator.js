"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastGreet = fastGreet;
exports.microReflexoLocal = microReflexoLocal;
exports.chatCompletion = chatCompletion;
const OpenRouterAdapter_1 = require("../adapters/OpenRouterAdapter");
const text_1 = require("../utils/text");
const hedge_1 = require("./policies/hedge");
const MODEL_MAIN = process.env.ECO_MODEL_MAIN || "openai/gpt-5-chat";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini";
async function fastGreet(prompt) {
    const lightSystem = "Você é a ECO, acolhedora e concisa. Responda em 1–2 frases, em PT-BR, convidando a pessoa a começar. Evite perguntas múltiplas.";
    const headers = {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
        "X-Title": "Eco App - Fast Lane",
    };
    const data = await (0, OpenRouterAdapter_1.callOpenRouterChat)({
        model: MODEL_TECH_ALT,
        temperature: 0.6,
        max_tokens: 180,
        messages: [
            { role: "system", content: lightSystem },
            { role: "user", content: prompt },
        ],
    }, headers, 6000);
    const raw = data?.choices?.[0]?.message?.content ??
        "Olá! 🙂 Estou aqui. O que tá pedindo atenção agora?";
    return (0, text_1.formatarTextoEco)((0, text_1.limparResposta)(raw));
}
const REFLEXAO_MAP = {
    // Energia baixa / Exaustão
    cansaco: {
        patterns: [/cansad/, /exaust/, /esgotad/, /sem energia/, /sem forç/, /derrubad/],
        responses: [
            "Entendi. Parece que o corpo está pedindo pausa. Quer começar com 1 minuto de respiração ou prefere só desabafar um pouco?",
            "O cansaço chegou forte. Topa fazer um check-in rápido: qual parte do corpo grita mais por descanso?",
            "Percebo a sua exaustão. Antes de mais nada: quando foi a última pausa real? Quer começar com água e 3 respirações profundas?"
        ],
        priority: 2
    },
    // Ansiedade / Preocupação
    ansiedade: {
        patterns: [/ansios/, /preocupad/, /nervos/, /agitad/, /inquiet/, /tens[aã]o/, /estress/],
        responses: [
            "Percebo ansiedade aí. Topa notar 3 pontos de apoio do corpo agora e, se quiser, me contar onde ela pega mais?",
            "A ansiedade está alta. Vamos tentar: nome 5 coisas que você vê, 4 que você toca, 3 que você ouve. Ou prefere falar primeiro?",
            "Sinto a tensão. Quer soltar em palavras o que mais preocupa, ou começamos baixando a ativação do corpo?"
        ],
        priority: 1
    },
    // Tristeza / Melancolia
    tristeza: {
        patterns: [/triste/, /melancoli/, /deprimi/, /pra baixo/, /down/, /desanimat/, /vazi/],
        responses: [
            "Sinto a tristeza chegando. Prefere nomear o que mais doeu ou que eu guie uma micro-pausa?",
            "A tristeza pede espaço. Topa dar nome ao que tá pesando e depois a gente vê o que fazer com isso?",
            "Percebo o peso. Quer escrever livremente sobre o que tá sentindo ou prefere uma presença quieta por um minuto?"
        ],
        priority: 2
    },
    // Raiva / Irritação
    raiva: {
        patterns: [/irritad/, /raiva/, /bravo/, /puto/, /com raiva/, /ódio/, /furioso/],
        responses: [
            "Raiva é energia. Quer soltar em palavras o gatilho principal, sem filtro, ou tentamos baixar um pouco a ativação primeiro?",
            "Sinto a irritação. Topa nomear: o que foi a gota d'água? E o que você gostaria de fazer com essa energia?",
            "A raiva tem mensagem. Quer descarregar aqui primeiro ou já mapear o que ela tá protegendo?"
        ],
        priority: 1
    },
    // Medo / Insegurança
    medo: {
        patterns: [/medo/, /receio/, /insegur/, /apreensiv/, /assustado/, /com medo/, /pânico/],
        responses: [
            "Tem medo no ar. Podemos mapear rapidamente: 1) o que ameaça, 2) o que te protege, 3) qual seria o próximo passo menor. Topa?",
            "O medo apareceu. Primeiro: você está seguro agora? Depois a gente nomeia do que é o medo e o que fazer com ele.",
            "Percebo a insegurança. Quer identificar se é medo real ou ansiedade do 'e se'? Te ajudo a separar os dois."
        ],
        priority: 1
    },
    // Sobrecarga / Overwhelm
    sobrecarga: {
        patterns: [/sobrecarregad/, /muito/, /demais/, /n[aã]o aguento/, /não dou conta/, /overwhelm/],
        responses: [
            "Sobrecarga detectada. Vamos fazer um 'dump cerebral'? Lista tudo sem ordem, depois a gente organiza o que é urgente de verdade.",
            "Parece que tá sendo demais. Topa fazer um inventário: 1) o que é urgente real, 2) o que é só barulho, 3) o que pode esperar?",
            "Entendo. Muita coisa junto. Quer começar escolhendo UMA coisa pra resolver agora, ou precisa desabafar tudo primeiro?"
        ],
        priority: 1
    },
    // Confusão / Indecisão
    confusao: {
        patterns: [/confus/, /perdid/, /sem rumo/, /não sei/, /indecis/, /bagunçad/],
        responses: [
            "Percebo a confusão. Vamos clarear: qual a pergunta principal que tá presa aí? Às vezes só nomear já ajuda.",
            "Tá nebuloso. Topa fazer um exercício? Completa: 'Eu estaria mais claro se...' e vê o que vem.",
            "A indecisão tem espaço. Quer listar prós/contras ou prefere explorar o que você realmente quer por baixo disso?"
        ],
        priority: 2
    },
    // Solidão / Desconexão
    solidao: {
        patterns: [/solitári/, /sozinho/, /isolad/, /desconect/, /distante/, /abandonad/],
        responses: [
            "Sinto a solidão. Ela é física (falta de gente) ou emocional (mesmo perto de outros)? Isso muda o caminho.",
            "A desconexão pesa. Topa identificar: com quem/o quê você sente falta de conexão? Pessoas, você mesmo, propósito?",
            "Percebo o isolamento. Quer começar reconectando com você mesmo aqui (eu te acompanho) ou prefere pensar em pontes pra fora?"
        ],
        priority: 2
    },
    // Culpa / Vergonha
    culpa: {
        patterns: [/culpad/, /vergonha/, /arrependid/, /remorso/, /erro meu/],
        responses: [
            "Tem culpa no ar. Vamos separar: foi erro seu mesmo ou você tá carregando peso que não é seu? Faz diferença.",
            "A culpa apareceu. Topa um exercício? 1) O que aconteceu (fatos), 2) O que você podia controlar de verdade, 3) O que fazer agora.",
            "Percebo vergonha. Ela costuma distorcer. Quer nomear o que aconteceu sem julgamento, tipo contando pra um amigo?"
        ],
        priority: 2
    },
    // Frustração / Bloqueio
    frustracao: {
        patterns: [/frustrad/, /travad/, /bloquead/, /empacad/, /não sai/, /não anda/],
        responses: [
            "Frustração detectada. O que tá travando: falta de clareza, falta de energia ou obstáculo real? Vamos destrinchar.",
            "Percebo o bloqueio. Às vezes ajuda trocar: ao invés de 'por que não consigo?', tenta 'o que eu precisaria pra conseguir?'.",
            "Tá empacado. Topa mudar o ângulo? Me conta: se isso não importasse nada, o que você faria diferente?"
        ],
        priority: 2
    },
    // Esperança / Motivação baixa
    desmotivacao: {
        patterns: [/desmotivad/, /sem esperança/, /desistindo/, /não vale/, /pra qu[eê]/, /tanto faz/],
        responses: [
            "Percebo a desmotivação. Ela é cansaço (precisa pausa) ou descrença (precisa reconectar com o porquê)? São caminhos diferentes.",
            "A esperança tá baixa. Topa fazer um resgate? Lembra de uma vez que você superou algo difícil - o que te moveu lá?",
            "Sinto o 'pra quê'. Sem pressão: se você tivesse só 10% de energia, no que você investiria? Às vezes o menor passo acorda algo."
        ],
        priority: 2
    },
    // Gratidão / Positivo (também vale reconhecer!)
    gratidao: {
        patterns: [/grat/, /feliz/, /alegre/, /bem/, /ótimo/, /maravilh/, /aliviado/],
        responses: [
            "Que bom sentir isso! Topa registrar o que está gerando esse bem-estar? Anotar ajuda a voltar aqui quando precisar.",
            "Percebo leveza. Aproveita: o que desse momento você quer guardar ou expandir?",
            "Legal! Quer celebrar isso de alguma forma ou só deixar a sensação acontecer?"
        ],
        priority: 3
    }
};
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function microReflexoLocal(msg) {
    const t = (msg || "").trim().toLowerCase();
    if (!t)
        return null;
    const hits = [];
    for (const [key, cfg] of Object.entries(REFLEXAO_MAP)) {
        if (cfg.patterns.some((rx) => rx.test(t))) {
            hits.push({ key, priority: cfg.priority, responses: cfg.responses });
        }
    }
    if (hits.length === 0)
        return null;
    // menor prioridade = mais urgente (1 > 2 > 3)
    hits.sort((a, b) => a.priority - b.priority);
    const best = hits[0];
    return pickRandom(best.responses) ?? null;
}
async function chatCompletion(messages, maxTokens) {
    const headers = {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
        "X-Title": "Eco App - Chat",
    };
    const main = (0, OpenRouterAdapter_1.callOpenRouterChat)({
        model: MODEL_MAIN,
        messages,
        temperature: 0.7,
        top_p: 0.9,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        max_tokens: maxTokens,
    }, headers, 9000);
    const mini = (0, OpenRouterAdapter_1.callOpenRouterChat)({
        model: MODEL_TECH_ALT,
        messages,
        temperature: 0.65,
        top_p: 0.9,
        max_tokens: Math.min(420, maxTokens),
    }, headers, 5500);
    return (0, hedge_1.hedge)(main, mini, 2500);
}
//# sourceMappingURL=ResponseGenerator.js.map
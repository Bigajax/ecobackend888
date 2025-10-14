import type { EcoHintFlag } from "../utils/types";

export interface ReflexoPattern {
  key: string;
  priority: 1 | 2 | 3;
  patterns: RegExp[];
  defaultFlags: EcoHintFlag[];
  emotions: string[];
  intent?: string;
}

export const REFLEXO_PATTERNS: ReflexoPattern[] = [
  {
    key: "cansaco",
    priority: 2,
    patterns: [/cansad/, /exaust/, /esgotad/, /sem energia/, /sem forç/, /derrubad/],
    defaultFlags: ["body_scan", "needs_reassurance", "slow_pacing"],
    emotions: ["cansaço", "exaustão"],
    intent: "ground_and_restore",
  },
  {
    key: "ansiedade",
    priority: 1,
    patterns: [/ansios/, /preocupad/, /nervos/, /agitad/, /inquiet/, /tens[aã]o/, /estress/],
    defaultFlags: ["needs_grounding", "slow_breath", "name_signal"],
    emotions: ["ansiedade"],
    intent: "stabilize",
  },
  {
    key: "tristeza",
    priority: 2,
    patterns: [/triste/, /melancoli/, /deprimi/, /pra baixo/, /down/, /desanimat/, /vazi/],
    defaultFlags: ["needs_validation", "tender_voice", "slow_pacing"],
    emotions: ["tristeza"],
    intent: "hold_space",
  },
  {
    key: "raiva",
    priority: 1,
    patterns: [/irritad/, /raiva/, /bravo/, /puto/, /com raiva/, /ódio/, /furioso/],
    defaultFlags: ["ack_intensity", "name_boundaries", "invite_channel"],
    emotions: ["raiva"],
    intent: "name_values",
  },
  {
    key: "medo",
    priority: 1,
    patterns: [/medo/, /receio/, /insegur/, /apreensiv/, /assustado/, /com medo/, /pânico/],
    defaultFlags: ["needs_safety", "slow_breath", "normalize_response"],
    emotions: ["medo"],
    intent: "stabilize",
  },
  {
    key: "sobrecarga",
    priority: 1,
    patterns: [/sobrecarregad/, /muito/, /demais/, /n[aã]o aguento/, /não dou conta/, /overwhelm/],
    defaultFlags: ["prioritize", "chunk_down", "needs_validation"],
    emotions: ["sobrecarga"],
    intent: "organize",
  },
  {
    key: "confusao",
    priority: 2,
    patterns: [/confus/, /perdid/, /sem rumo/, /não sei/, /indecis/, /bagunçad/],
    defaultFlags: ["clarify_context", "invite_choice", "normalize_response"],
    emotions: ["confusão"],
    intent: "organize",
  },
  {
    key: "solidao",
    priority: 2,
    patterns: [/solitári/, /sozinho/, /isolad/, /desconect/, /distante/, /abandonad/],
    defaultFlags: ["tender_voice", "highlight_connection", "needs_validation"],
    emotions: ["solidão"],
    intent: "nurture",
  },
  {
    key: "culpa",
    priority: 2,
    patterns: [/culpad/, /vergonha/, /arrependid/, /remorso/, /erro meu/],
    defaultFlags: ["self_compassion", "reframe", "slow_pacing"],
    emotions: ["culpa", "vergonha"],
    intent: "restore_compassion",
  },
  {
    key: "frustracao",
    priority: 2,
    patterns: [/frustrad/, /travad/, /bloquead/, /empacad/, /não sai/, /não anda/],
    defaultFlags: ["ack_intensity", "invite_small_step", "normalize_response"],
    emotions: ["frustração"],
    intent: "unlock_flow",
  },
  {
    key: "desmotivacao",
    priority: 2,
    patterns: [/desmotivad/, /sem esperança/, /desistindo/, /não vale/, /pra qu[eê]/, /tanto faz/],
    defaultFlags: ["spark_meaning", "gentle_energy", "needs_validation"],
    emotions: ["desmotivação"],
    intent: "reignite_meaning",
  },
  {
    key: "gratidao",
    priority: 3,
    patterns: [/grat/, /feliz/, /alegre/, /bem/, /ótimo/, /maravilh/, /aliviado/],
    defaultFlags: ["celebrate", "reflect_strength", "light_tone"],
    emotions: ["gratidão", "alegria"],
    intent: "amplify_positive",
  },
];

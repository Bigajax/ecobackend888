/**
 * Quem está falando com a Eco e quanto ainda pode falar hoje (set/2026).
 *
 * 1. verificarToken: valida o Bearer no Supabase, com cache de 5 min para não
 *    somar latência a cada mensagem. O id do usuário vem daqui, nunca do corpo
 *    (antes o chat aceitava usuario_id do corpo e o front nem mandava token,
 *    então nenhuma memória era salva para quem estava logado).
 * 2. checarLimite: conversa grátis tem 30 mensagens por dia (essentials 100;
 *    assinatura, teste e VIP sem limite). Antes o limite só existia no
 *    navegador e sumia ao limpar os dados. Contagem em memória por dia de
 *    Brasília: um reinício do servidor zera o dia, a favor da pessoa.
 */
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { getSubscriptionService } from "./SubscriptionService";

const CINCO_MIN = 5 * 60 * 1000;

const VIP_EMAILS = new Set(
  [
    "acessoriaintuitivo@gmail.com",
    "eriveltonery@hotmail.com",
    "marcelorazeira@gmail.com",
    "mernomarcelo@gmail.com",
    "rafaelrazeira@hotmail.com",
    ...(process.env.VIP_EMAILS ?? "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export interface UsuarioVerificado {
  id: string;
  email: string;
}

const tokens = new Map<string, { usuario: UsuarioVerificado | null; ate: number }>();

export async function verificarToken(token: string | null | undefined): Promise<UsuarioVerificado | null> {
  if (!token) return null;
  const agora = Date.now();
  const cache = tokens.get(token);
  if (cache && cache.ate > agora) return cache.usuario;

  let usuario: UsuarioVerificado | null = null;
  try {
    const { data, error } = await ensureSupabaseConfigured().auth.getUser(token);
    if (!error && data?.user) usuario = { id: data.user.id, email: (data.user.email ?? "").toLowerCase() };
  } catch {
    usuario = null;
  }

  if (tokens.size > 5000) tokens.clear();
  tokens.set(token, { usuario, ate: agora + CINCO_MIN });
  return usuario;
}

export const LIMITE_GRATIS = 30;
const LIMITE_ESSENTIALS = 100;

const limites = new Map<string, { limite: number; ate: number }>();
const contagem = new Map<string, { dia: string; n: number }>();

const hojeEmBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function limiteDe(usuario: UsuarioVerificado | null): Promise<number> {
  if (!usuario) return LIMITE_GRATIS;
  if (VIP_EMAILS.has(usuario.email)) return Infinity;
  const cache = limites.get(usuario.id);
  if (cache && cache.ate > Date.now()) return cache.limite;

  let limite = LIMITE_GRATIS;
  try {
    const status = await getSubscriptionService().getStatus(usuario.id);
    if (status.isTrialActive || status.plan === "premium_monthly" || status.plan === "premium_annual") limite = Infinity;
    else if (status.plan === "essentials_monthly") limite = LIMITE_ESSENTIALS;
  } catch {
    // na dúvida, não bloqueia quem pode ter pago
    limite = Infinity;
  }
  limites.set(usuario.id, { limite, ate: Date.now() + CINCO_MIN });
  return limite;
}

/**
 * Conta a mensagem se couber no dia. `chave` é o id do usuário ou, sem login,
 * o id de visitante.
 */
export async function checarLimite(
  chave: string,
  usuario: UsuarioVerificado | null
): Promise<{ ok: boolean; limite: number; usadas: number }> {
  const limite = await limiteDe(usuario);
  if (limite === Infinity) return { ok: true, limite, usadas: 0 };

  const dia = hojeEmBrasilia();
  const atual = contagem.get(chave);
  const usadas = atual && atual.dia === dia ? atual.n : 0;
  if (usadas >= limite) return { ok: false, limite, usadas };

  if (contagem.size > 50000) contagem.clear();
  contagem.set(chave, { dia, n: usadas + 1 });
  return { ok: true, limite, usadas: usadas + 1 };
}

/**
 * Lembrete do fim do teste (set/2026). O /assinar promete: "Dia 5: mandamos um
 * e-mail avisando que o teste está terminando". Não existia envio nenhum.
 *
 * De hora em hora, pega quem está no teste com fim nas próximas 24 a 48 horas
 * e manda um e-mail. Cada envio é registrado antes em webhook_logs (chave única
 * por usuário e data de fim), então reinício do servidor não repete e-mail.
 */
import { Resend } from "resend";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "./promptContext/logger";

const logger = log.withContext("lembrete-teste");
const HORA_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

function dataPorExtenso(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long" }).format(
    new Date(iso)
  );
}

function html(fim: string, anual: boolean, appUrl: string) {
  const preco = anual ? "R$ 142,80 por ano" : "R$ 15,90 por mês";
  const contaUrl = `${appUrl}/app/configuracoes`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:32px 16px;background:#e9e6dc;font-family:Helvetica,Arial,sans-serif;color:#1c2350;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="100%" style="max-width:520px;background:#f4f1e8;padding:32px 28px;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;color:#4b5070;">Ecotopia</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:normal;font-family:Georgia,serif;">Seu teste termina em ${fim}.</h1>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Até lá, tudo segue aberto. Depois, a assinatura continua sozinha: ${preco}, no cartão que você cadastrou.</p>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Se quiser continuar, não precisa fazer nada. Se não quiser, cancele antes de ${fim} e nada é cobrado.</p>
        <a href="${contaUrl}" style="display:inline-block;background:#1c2350;color:#f4f1e8;text-decoration:none;padding:12px 20px;font-size:15px;">Ver minha assinatura</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#4b5070;">Dúvidas: responda este e-mail.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function enviarLembretesDoTeste(): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("sem_resend_api_key");
    return 0;
  }
  const supabase = ensureSupabaseConfigured();
  const agora = Date.now();

  const { data: usuarios, error } = await supabase
    .from("usuarios")
    .select("id, email, trial_end_date, plan_type")
    .eq("subscription_status", "active")
    .not("provider_preapproval_id", "is", null)
    .gt("trial_end_date", new Date(agora + 24 * HORA_MS).toISOString())
    .lte("trial_end_date", new Date(agora + 48 * HORA_MS).toISOString());

  if (error) {
    logger.error("consulta_falhou", { error: error.message });
    return 0;
  }

  const resend = new Resend(apiKey);
  const from = `Ecotopia <${process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"}>`;
  const appUrl = process.env.APP_URL || "https://ecofrontend888.vercel.app";
  let enviados = 0;

  for (const u of usuarios ?? []) {
    if (!u.email || !u.trial_end_date) continue;

    // Reserva o envio; se já existe (unique source+event_id), já foi mandado.
    const { error: jaEnviado } = await supabase.from("webhook_logs").insert({
      source: "ecotopia",
      event_type: "trial_reminder",
      event_id: `trial_reminder:${u.id}:${u.trial_end_date.slice(0, 10)}`,
      payload: { user_id: u.id, trial_end_date: u.trial_end_date },
      processed: true,
      processed_at: new Date().toISOString(),
    });
    if (jaEnviado) continue;

    const fim = dataPorExtenso(u.trial_end_date);
    const { error: e } = await resend.emails.send({
      from,
      replyTo: "ecotopia.app777@gmail.com",
      to: u.email,
      subject: `Seu teste do Ecotopia termina em ${fim}`,
      html: html(fim, u.plan_type === "annual", appUrl),
    });
    if (e) logger.error("envio_falhou", { userId: u.id, error: e.message });
    else enviados += 1;
  }

  if (enviados) logger.info("lembretes_enviados", { enviados });
  return enviados;
}

export function iniciarLembretesDoTeste() {
  if (timer) return;
  const rodar = () => void enviarLembretesDoTeste().catch((err) => logger.error("falhou", { error: String(err) }));
  setTimeout(rodar, 2 * 60 * 1000).unref();
  timer = setInterval(rodar, HORA_MS);
  timer.unref();
}

export function pararLembretesDoTeste() {
  if (timer) clearInterval(timer);
  timer = null;
}

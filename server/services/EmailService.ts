import { Resend } from "resend";
import { log } from "./promptContext/logger";

const logger = log.withContext("email-service");

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurado");
  return new Resend(apiKey);
}

/**
 * Envia e-mail de boas-vindas ao comprador do Protocolo Sono Profundo.
 * Disparado pelo webhook do MP após confirmação do pagamento.
 */
export async function sendSonoWelcomeEmail(params: {
  to: string;
  externalReference: string;
  appUrl: string;
}): Promise<void> {
  const { to, externalReference, appUrl } = params;

  const registerUrl = `${appUrl}/register?returnTo=${encodeURIComponent(
    `/sono/obrigado?external_reference=${externalReference}&status=approved`
  )}`;

  const loginUrl = `${appUrl}/login?returnTo=${encodeURIComponent(
    `/sono/obrigado?external_reference=${externalReference}&status=approved`
  )}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Seu Protocolo Sono Profundo está pronto</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:40px 32px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;letter-spacing:3px;color:#8ecae6;text-transform:uppercase;font-weight:600;">Ecotopia</p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">
                Pagamento confirmado 🌙
              </h1>
              <p style="margin:12px 0 0 0;font-size:15px;color:#b0c4d8;line-height:1.5;">
                Seu <strong style="color:#8ecae6;">Protocolo Sono Profundo – 7 noites</strong> está esperando por você.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 16px;">
              <p style="margin:0 0 20px 0;font-size:16px;color:#374151;line-height:1.7;">
                Olá! Recebemos seu pagamento com sucesso. Para acessar as 7 meditações guiadas do protocolo, basta criar sua conta gratuita na Ecotopia.
              </p>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:12px 16px;background:#f0faf5;border-radius:10px;margin-bottom:8px;display:block;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:32px;vertical-align:top;">
                          <span style="display:inline-block;width:24px;height:24px;background:#22c55e;border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:700;color:#fff;">1</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:top;font-size:14px;color:#374151;line-height:1.5;">
                          <strong>Crie sua conta</strong> gratuita na Ecotopia (leva menos de 1 minuto)
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px;background:#f0f4ff;border-radius:10px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:32px;vertical-align:top;">
                          <span style="display:inline-block;width:24px;height:24px;background:#6366f1;border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:700;color:#fff;">2</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:top;font-size:14px;color:#374151;line-height:1.5;">
                          Seu acesso ao protocolo é <strong>liberado automaticamente</strong> após o cadastro
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px;background:#fef9f0;border-radius:10px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:32px;vertical-align:top;">
                          <span style="display:inline-block;width:24px;height:24px;background:#f59e0b;border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:700;color:#fff;">3</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:top;font-size:14px;color:#374151;line-height:1.5;">
                          <strong>Comece esta noite.</strong> Ouça a primeira meditação e durma melhor já na noite 1
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA principal -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <a href="${registerUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:50px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(15,52,96,0.35);">
                      Criar minha conta e acessar →
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin:0;font-size:13px;color:#6b7280;">
                      Já tem conta?
                      <a href="${loginUrl}" style="color:#0f3460;font-weight:600;text-decoration:underline;">Entrar aqui</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            </td>
          </tr>

          <!-- Order info -->
          <tr>
            <td style="padding:0 32px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px;">
                <tr>
                  <td style="font-size:12px;color:#6b7280;padding:4px 16px;">
                    <strong style="color:#374151;">Número do pedido:</strong><br/>
                    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${externalReference}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#6b7280;padding:8px 16px 4px;">
                    Guarde este número caso precise acionar o suporte.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 36px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                Dúvidas? Responda este e-mail ou escreva para
                <a href="mailto:ecotopia.app777@gmail.com" style="color:#0f3460;text-decoration:none;">ecotopia.app777@gmail.com</a>
              </p>
              <p style="margin:10px 0 0 0;font-size:11px;color:#d1d5db;">
                © 2025 Ecotopia · Cuide da sua mente, cuide do seu sono.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const resend = getResendClient();

    const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const { error } = await resend.emails.send({
      from: `Ecotopia <${fromAddress}>`,
      replyTo: "ecotopia.app777@gmail.com",
      to,
      subject: "🌙 Seu Protocolo Sono Profundo está pronto — acesse agora",
      html,
    });

    if (error) {
      logger.error("resend_send_failed", { to, error: error.message });
      return;
    }

    logger.info("sono_welcome_email_sent", { to, externalReference });
  } catch (err) {
    logger.error("resend_unexpected_error", {
      to,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

import type { Request, Response } from "express";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("entitlement-controller");

/**
 * GET /api/entitlements/check?product_key=protocolo_sono_7_noites
 *
 * Verifica se o usuário autenticado possui acesso ativo ao produto.
 * Requer auth.
 *
 * Returns: { hasAccess: boolean }
 */
export async function checkEntitlement(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Usuário não autenticado" });
    }

    const productKey = req.query.product_key as string | undefined;

    if (!productKey) {
      return res.status(400).json({ error: "MISSING_PRODUCT_KEY", message: "Parâmetro product_key obrigatório" });
    }

    const supabase = ensureSupabaseConfigured();

    const { data, error } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("product_key", productKey)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      logger.error("check_entitlement_db_error", { userId, productKey, error: error.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao verificar acesso" });
    }

    logger.debug("check_entitlement", { userId, productKey, hasAccess: !!data });

    return res.status(200).json({ hasAccess: !!data });
  } catch (error) {
    logger.error("check_entitlement_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao verificar acesso" });
  }
}

/**
 * POST /api/entitlements/claim
 *
 * Vincula um entitlement ao usuário autenticado.
 * Requer auth.
 *
 * Body: { external_reference?, payment_id?, email? }
 * Returns: { success: true, entitlement }
 */
export async function claimEntitlement(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Usuário não autenticado" });
    }

    const { external_reference, payment_id, email } = req.body ?? {};

    if (!external_reference && !payment_id && !email) {
      return res.status(400).json({
        error: "MISSING_IDENTIFIER",
        message: "Informe external_reference, payment_id ou email para reivindicar o acesso",
      });
    }

    const supabase = ensureSupabaseConfigured();

    // Buscar entitlement — prioridade: external_reference > payment_id > email
    let query = supabase
      .from("entitlements")
      .select("*")
      .eq("status", "active");

    if (external_reference) {
      query = query.eq("external_reference", external_reference);
    } else if (payment_id) {
      query = query.eq("payment_id", String(payment_id));
    } else {
      // fallback por email do pagador OU email do usuário logado
      const emailToSearch = email || userEmail;
      query = query.eq("email", emailToSearch);
    }

    const { data: found, error: findError } = await query.maybeSingle();

    if (findError) {
      logger.error("claim_entitlement_find_error", { userId, error: findError.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao buscar entitlement" });
    }

    if (!found) {
      logger.warn("claim_entitlement_not_found", { userId, external_reference, payment_id });
      return res.status(404).json({ error: "NOT_FOUND", message: "Entitlement não encontrado ou ainda não confirmado" });
    }

    // Idempotência: já vinculado ao mesmo usuário
    if (found.user_id === userId) {
      logger.info("claim_entitlement_already_owned", { userId, entitlementId: found.id });
      return res.status(200).json({ success: true, entitlement: found });
    }

    // Conflito: já vinculado a outro usuário
    if (found.user_id && found.user_id !== userId) {
      logger.warn("claim_entitlement_conflict", {
        userId,
        ownerUserId: found.user_id,
        entitlementId: found.id,
      });
      return res.status(409).json({
        error: "ALREADY_CLAIMED",
        message: "Este entitlement já foi reivindicado por outra conta",
      });
    }

    // Vincular ao usuário
    const { data: updated, error: updateError } = await supabase
      .from("entitlements")
      .update({ user_id: userId })
      .eq("id", found.id)
      .select("*")
      .single();

    if (updateError) {
      logger.error("claim_entitlement_update_error", { userId, entitlementId: found.id, error: updateError.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao vincular acesso" });
    }

    logger.info("claim_entitlement_success", { userId, entitlementId: found.id, productKey: found.product_key });

    return res.status(200).json({ success: true, entitlement: updated });
  } catch (error) {
    logger.error("claim_entitlement_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao reivindicar acesso" });
  }
}

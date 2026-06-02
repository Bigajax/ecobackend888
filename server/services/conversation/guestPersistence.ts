import { log } from "../promptContext/logger";

export interface GuestPersistenceParams {
  supabase: any;
  guestId: string;
  userMessage: string;
  assistantResponse: string;
  ip?: string;
  ua?: string;
}

/**
 * Ensures a guest session exists in Supabase guest_sessions table
 * Updates last_seen_at timestamp on each interaction
 */
export async function ensureGuestSession(params: {
  supabase: any;
  guestId: string;
  ip?: string;
  ua?: string;
}): Promise<void> {
  const { supabase, guestId, ip, ua } = params;

  if (!supabase || !guestId) return;

  try {
    // Try to insert or ignore if already exists
    const { error } = await supabase
      .from("guest_sessions")
      .upsert(
        {
          id: guestId,
          created_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          ip: ip || null,
          ua: ua || null,
        },
        { onConflict: "id" }
      );

    if (error) {
      log.warn("[guest_sessions] falha ao garantir sessão", {
        guestId,
        error: error.message,
      });
    }
  } catch (e) {
    log.warn("[guest_sessions] erro ao criar/atualizar", {
      guestId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Saves guest message and response to guest_messages table
 * Called after receiving response from Claude
 */
export async function persistGuestMessage(params: GuestPersistenceParams): Promise<void> {
  const { supabase, guestId, userMessage, assistantResponse, ip, ua } = params;

  if (!supabase || !guestId) return;

  try {
    // First ensure guest session exists/is updated
    await ensureGuestSession({
      supabase,
      guestId,
      ip,
      ua,
    });

    // Insert user message
    const { error: userMsgError } = await supabase.from("guest_messages").insert({
      guest_id: guestId,
      created_at: new Date().toISOString(),
      role: "user",
      text: userMessage,
    });

    if (userMsgError) {
      log.warn("[guest_messages] falha ao salvar mensagem do usuário", {
        guestId,
        error: userMsgError.message,
      });
    }

    // Insert assistant response
    const { error: assistantMsgError } = await supabase
      .from("guest_messages")
      .insert({
        guest_id: guestId,
        created_at: new Date().toISOString(),
        role: "assistant",
        text: assistantResponse,
      });

    if (assistantMsgError) {
      log.warn("[guest_messages] falha ao salvar resposta do assistente", {
        guestId,
        error: assistantMsgError.message,
      });
    }

    log.info("[guest_messages] mensagens salvas com sucesso", {
      guestId,
      userMsgLength: userMessage.length,
      assistantMsgLength: assistantResponse.length,
    });
  } catch (e) {
    log.warn("[guest_messages] erro ao persistir", {
      guestId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Update last_seen_at for a guest session (lightweight ping)
 */
export async function updateGuestLastSeen(
  supabase: any,
  guestId: string
): Promise<void> {
  if (!supabase || !guestId) return;

  try {
    await supabase
      .from("guest_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", guestId);
  } catch (e) {
    // Silent fail - this is just a ping
    if (process.env.ECO_DEBUG === "true") {
      log.debug("[guest_sessions] ping failed", {
        guestId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

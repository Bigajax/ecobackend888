/**
 * RingsService: os dias dos Cinco Anéis (jornada de 30 dias, set/2026).
 *
 * Cada dia é um registro em daily_rituals (único por usuário e data) com as
 * respostas em ring_answers (única por dia e anel). Um dia se fecha com uma
 * resposta: a pergunta do anel da vez. Antes o servidor exigia as 5 respostas
 * e um ritual criado por /start que o front nunca chamava, então nada salvava.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./promptContext/logger";

const logger = log.withContext("rings-service");

export const ANEIS = ["earth", "water", "fire", "wind", "void"] as const;
export type Anel = (typeof ANEIS)[number];

export interface RespostaDoDia {
  date: string;
  ringId: Anel;
  answer: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

/** Formato que o front usa (DailyRitual). */
function paraFront(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    status: row.status,
    notes: row.notes ?? undefined,
    completedAt: row.completed_at ?? undefined,
    answers: (row.ring_answers ?? []).map((a: any) => ({
      ringId: a.ring_id,
      answer: a.answer,
      metadata: a.metadata ?? {},
      timestamp: a.answered_at,
    })),
  };
}

export class RingsService {
  constructor(private supabase: SupabaseClient) {}

  /** Salva a resposta do dia e marca o dia como feito (idempotente por data e anel). */
  async salvarDia(userId: string, r: RespostaDoDia) {
    const agora = new Date().toISOString();
    const { data: dia, error: e1 } = await this.supabase
      .from("daily_rituals")
      .upsert(
        { user_id: userId, date: r.date, status: "completed", completed_at: r.timestamp ?? agora, updated_at: agora },
        { onConflict: "user_id,date" }
      )
      .select("id")
      .single();
    if (e1) throw e1;

    const { error: e2 } = await this.supabase.from("ring_answers").upsert(
      {
        ritual_id: dia.id,
        ring_id: r.ringId,
        answer: r.answer,
        metadata: r.metadata ?? {},
        answered_at: r.timestamp ?? agora,
      },
      { onConflict: "ritual_id,ring_id" }
    );
    if (e2) throw e2;

    const { data, error: e3 } = await this.supabase
      .from("daily_rituals")
      .select("*, ring_answers(*)")
      .eq("id", dia.id)
      .single();
    if (e3) throw e3;
    return paraFront(data);
  }

  async historico(userId: string, limit = 100) {
    const { data, error } = await this.supabase
      .from("daily_rituals")
      .select("*, ring_answers(*)")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(Math.max(1, Math.min(400, limit)));
    if (error) throw error;
    return (data ?? []).map(paraFront);
  }

  /** Sobe dias feitos só no aparelho. Por data e anel, então repetir não duplica. */
  async migrar(userId: string, rituais: any[]) {
    let dias = 0;
    const erros: string[] = [];
    for (const ritual of rituais) {
      if (ritual?.status !== "completed" || typeof ritual?.date !== "string") continue;
      const respostas = Array.isArray(ritual.answers) ? ritual.answers : [];
      let salvou = false;
      for (const a of respostas) {
        if (!ANEIS.includes(a?.ringId) || typeof a?.answer !== "string" || !a.answer.trim()) continue;
        try {
          await this.salvarDia(userId, {
            date: ritual.date,
            ringId: a.ringId,
            answer: a.answer,
            metadata: a.metadata,
            timestamp: a.timestamp,
          });
          salvou = true;
        } catch (err) {
          erros.push(`${ritual.date}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (salvou) dias += 1;
    }
    logger.info("rings_migrated", { userId, dias, erros: erros.length });
    return { success: true, migratedCount: dias, errors: erros.length ? erros : undefined };
  }
}

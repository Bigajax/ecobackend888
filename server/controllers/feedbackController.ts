import type { Request, Response } from "express";
import { supabase } from "../services/supabaseClient";

export async function registrarFeedback(req: Request, res: Response) {
  const { interaction_id, vote, reason, source, user_id, session_id, meta } = req.body ?? {};

  if (!interaction_id || !vote) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { data: exists, error: checkErr } = await supabase
    .from("analytics.eco_interactions")
    .select("id")
    .eq("id", interaction_id)
    .limit(1)
    .maybeSingle();

  if (checkErr) return res.status(500).json({ error: checkErr.message });
  if (!exists) return res.status(404).json({ error: "interaction_not_found" });

  const { error } = await supabase.from("analytics.eco_feedback").insert([
    {
      interaction_id,
      vote,
      reason,
      source,
      user_id: user_id ?? null,
      session_id: session_id ?? null,
      meta: meta ?? {},
    },
  ]);

  if (error) {
    if ((error as any).code === "23505") return res.status(204).end();
    return res.status(500).json({ error: error.message });
  }

  return res.status(204).end();
}

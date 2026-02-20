/**
 * RingsService - Business logic for Five Rings ritual management
 * Handles CRUD operations for daily rituals and ring answers
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./promptContext/logger";

const logger = log.withContext("rings-service");

export interface CreateRitualParams {
  userId: string;
  date: string;
  notes?: string;
}

export interface SaveRingAnswerParams {
  ritualId: string;
  ringId: string;
  answer: string;
  metadata: any;
}

export interface RitualHistoryParams {
  userId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  status?: string;
  includeAnswers?: boolean;
}

export class RingsService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get ritual by date for a specific user
   */
  async getRitualByDate(userId: string, date: string) {
    logger.info("get_ritual_by_date", { userId, date });

    const { data, error } = await this.supabase
      .from("daily_rituals")
      .select("*, ring_answers(*)")
      .eq("user_id", userId)
      .eq("date", date)
      .single();

    if (error) {
      // PGRST116 = no rows returned (not an error, just not found)
      if (error.code === "PGRST116") {
        logger.info("ritual_not_found", { userId, date });
        return null;
      }
      logger.error("get_ritual_by_date_error", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }

    return data;
  }

  /**
   * Create a new daily ritual
   */
  async createRitual(params: CreateRitualParams) {
    logger.info("create_ritual", {
      userId: params.userId,
      date: params.date,
    });

    const { data, error } = await this.supabase
      .from("daily_rituals")
      .insert({
        user_id: params.userId,
        date: params.date,
        status: "in_progress",
        notes: params.notes,
      })
      .select()
      .single();

    if (error) {
      logger.error("create_ritual_error", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }

    logger.info("ritual_created", { ritualId: data.id });
    return data;
  }

  /**
   * Save or update a ring answer (upsert)
   */
  async saveRingAnswer(params: SaveRingAnswerParams) {
    logger.info("save_ring_answer", {
      ritualId: params.ritualId,
      ringId: params.ringId,
    });

    // Verify ritual exists (security check via RLS)
    const { data: ritual, error: ritualError } = await this.supabase
      .from("daily_rituals")
      .select("id, user_id")
      .eq("id", params.ritualId)
      .single();

    if (ritualError || !ritual) {
      logger.error("ritual_not_found_for_answer", {
        ritualId: params.ritualId,
        error: ritualError?.message,
      });
      throw new Error("Ritual não encontrado");
    }

    // Upsert answer (insert or update if exists)
    const { data, error } = await this.supabase
      .from("ring_answers")
      .upsert(
        {
          ritual_id: params.ritualId,
          ring_id: params.ringId,
          answer: params.answer,
          metadata: params.metadata,
          answered_at: new Date().toISOString(),
        },
        {
          onConflict: "ritual_id,ring_id",
        }
      )
      .select()
      .single();

    if (error) {
      logger.error("save_ring_answer_error", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }

    // Update ritual updated_at timestamp
    await this.supabase
      .from("daily_rituals")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.ritualId);

    logger.info("ring_answer_saved", { answerId: data.id });
    return data;
  }

  /**
   * Count how many rings have been answered for a ritual
   */
  async countAnsweredRings(ritualId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("ring_answers")
      .select("*", { count: "exact", head: true })
      .eq("ritual_id", ritualId);

    if (error) {
      logger.error("count_answered_rings_error", { error: error.message });
      throw error;
    }

    return count || 0;
  }

  /**
   * Complete a ritual (mark as completed)
   */
  async completeRitual(ritualId: string, userId: string, notes?: string) {
    logger.info("complete_ritual", { ritualId, userId });

    // Verify all 5 rings are answered
    const answeredCount = await this.countAnsweredRings(ritualId);

    if (answeredCount < 5) {
      logger.error("incomplete_ritual", {
        ritualId,
        answeredCount,
        required: 5,
      });
      throw new Error(`Todos os 5 anéis devem ser respondidos. Você respondeu ${answeredCount}.`);
    }

    // Mark as completed
    const { data, error } = await this.supabase
      .from("daily_rituals")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        notes: notes || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ritualId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      logger.error("complete_ritual_error", { error: error.message });
      throw error;
    }

    logger.info("ritual_completed", { ritualId });
    return data;
  }

  /**
   * Abandon a ritual (mark as abandoned)
   */
  async abandonRitual(ritualId: string, userId: string) {
    logger.info("abandon_ritual", { ritualId, userId });

    const { data, error } = await this.supabase
      .from("daily_rituals")
      .update({
        status: "abandoned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ritualId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      logger.error("abandon_ritual_error", { error: error.message });
      throw error;
    }

    logger.info("ritual_abandoned", { ritualId });
    return data;
  }

  /**
   * Get ritual details with all answers
   */
  async getRitualDetails(ritualId: string, userId: string) {
    logger.info("get_ritual_details", { ritualId, userId });

    const { data, error } = await this.supabase
      .from("daily_rituals")
      .select("*, ring_answers(*)")
      .eq("id", ritualId)
      .eq("user_id", userId)
      .single();

    if (error) {
      logger.error("get_ritual_details_error", { error: error.message });
      throw error;
    }

    return data;
  }

  /**
   * Get ritual history with filters and pagination
   */
  async getRitualHistory(params: RitualHistoryParams) {
    logger.info("get_ritual_history", {
      userId: params.userId,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit,
    });

    const limit = params.limit || 30;
    const offset = params.offset || 0;
    const includeAnswers = params.includeAnswers !== false; // default true

    let query = this.supabase
      .from("daily_rituals")
      .select(
        includeAnswers ? "*, ring_answers(*)" : "*",
        { count: "exact" }
      )
      .eq("user_id", params.userId)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (params.startDate) {
      query = query.gte("date", params.startDate);
    }
    if (params.endDate) {
      query = query.lte("date", params.endDate);
    }
    if (params.status) {
      query = query.eq("status", params.status);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error("get_ritual_history_error", { error: error.message });
      throw error;
    }

    logger.info("ritual_history_loaded", {
      count: data?.length || 0,
      total: count || 0,
    });

    return {
      rituals: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    };
  }

  /**
   * Calculate user progress and statistics
   */
  async getUserProgress(userId: string) {
    logger.info("get_user_progress", { userId });

    // Get all rituals
    const { data: allRituals, error: allError } = await this.supabase
      .from("daily_rituals")
      .select("date, status")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (allError) {
      logger.error("get_user_progress_error", { error: allError.message });
      throw allError;
    }

    const rituals = allRituals || [];
    const completed = rituals.filter((r) => r.status === "completed");

    // Calculate streaks
    const streak = await this.calculateStreak(userId);

    // Calculate ring-specific stats
    const { data: ringAnswers } = await this.supabase
      .from("ring_answers")
      .select("ring_id")
      .in(
        "ritual_id",
        completed.map((r) => r.date)
      );

    const ringStats = {
      earth: 0,
      water: 0,
      fire: 0,
      wind: 0,
      void: 0,
    };

    if (ringAnswers) {
      ringAnswers.forEach((answer) => {
        const ringId = answer.ring_id as keyof typeof ringStats;
        if (ringStats[ringId] !== undefined) {
          ringStats[ringId]++;
        }
      });
    }

    const progress = {
      userId,
      totalDaysCompleted: completed.length,
      totalDaysTracked: rituals.length,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      complianceRate:
        rituals.length > 0 ? (completed.length / rituals.length) * 100 : 0,
      ringStats: {
        earth: { ringId: "earth", totalResponses: ringStats.earth, streakDays: 0 },
        water: { ringId: "water", totalResponses: ringStats.water, streakDays: 0 },
        fire: { ringId: "fire", totalResponses: ringStats.fire, streakDays: 0 },
        wind: { ringId: "wind", totalResponses: ringStats.wind, streakDays: 0 },
        void: { ringId: "void", totalResponses: ringStats.void, streakDays: 0 },
      },
      lastRitualDate: completed[0]?.date || null,
      nextRitualDate: new Date().toISOString().split("T")[0],
    };

    logger.info("user_progress_calculated", {
      totalDays: progress.totalDaysCompleted,
      currentStreak: progress.currentStreak,
    });

    return progress;
  }

  /**
   * Calculate current and longest streak for a user
   */
  async calculateStreak(userId: string): Promise<{ current: number; longest: number }> {
    const { data: rituals } = await this.supabase
      .from("daily_rituals")
      .select("date")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("date", { ascending: false });

    if (!rituals || rituals.length === 0) {
      return { current: 0, longest: 0 };
    }

    const dates = rituals.map((r) => r.date).sort().reverse();
    const today = new Date().toISOString().split("T")[0];

    let currentStreak = 0;
    let tempStreak = 0;
    let longestStreak = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const prevDate = dates[i + 1];

      if (i === 0) {
        // Check if today or yesterday
        const daysDiff = Math.floor(
          (new Date(today).getTime() - new Date(date).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysDiff <= 1) {
          tempStreak = 1;
        } else {
          break; // Streak broken
        }
      } else {
        // Check if consecutive
        const daysDiff = Math.floor(
          (new Date(date).getTime() - new Date(prevDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysDiff === 1) {
          tempStreak++;
        } else {
          // Streak broken, update longest and reset
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }

    currentStreak = tempStreak;
    longestStreak = Math.max(longestStreak, currentStreak);

    return { current: currentStreak, longest: longestStreak };
  }

  /**
   * Migrate rituals from localStorage (batch insert)
   */
  async migrateRituals(userId: string, rituals: any[]) {
    logger.info("migrate_rituals", {
      userId,
      ritualsCount: rituals.length,
    });

    let migratedCount = 0;
    const errors: any[] = [];

    for (const ritual of rituals) {
      try {
        // Check if already exists
        const existing = await this.getRitualByDate(userId, ritual.date);

        if (existing) {
          logger.info("ritual_already_exists", {
            date: ritual.date,
            skipping: true,
          });
          continue;
        }

        // Insert ritual
        const { data: newRitual, error: ritualError } = await this.supabase
          .from("daily_rituals")
          .insert({
            id: ritual.id,
            user_id: userId,
            date: ritual.date,
            status: ritual.status,
            notes: ritual.notes,
            completed_at: ritual.completedAt,
            started_at: ritual.completedAt || ritual.date,
          })
          .select()
          .single();

        if (ritualError) throw ritualError;

        // Insert answers
        if (ritual.answers && Array.isArray(ritual.answers)) {
          for (const answer of ritual.answers) {
            const { error: answerError } = await this.supabase
              .from("ring_answers")
              .insert({
                ritual_id: newRitual.id,
                ring_id: answer.ringId,
                answer: answer.answer,
                metadata: answer.metadata,
                answered_at: answer.timestamp,
              });

            if (answerError) throw answerError;
          }
        }

        migratedCount++;
        logger.info("ritual_migrated", { ritualId: ritual.id, date: ritual.date });
      } catch (error) {
        logger.error("migrate_ritual_error", {
          ritualId: ritual.id,
          error: error instanceof Error ? error.message : String(error),
        });
        errors.push({
          ritualId: ritual.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("migration_complete", {
      migratedCount,
      totalRituals: rituals.length,
      errorsCount: errors.length,
    });

    return {
      success: true,
      migratedCount,
      totalRituals: rituals.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

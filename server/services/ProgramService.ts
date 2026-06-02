import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Interface for program enrollment data
 */
export interface ProgramEnrollment {
  id: string;
  user_id: string;
  program_id: string;
  progress: number;
  current_step: number;
  current_lesson: string | null;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  last_accessed_at: string;
  completed_at: string | null;
  duration: string | null;
  device_info: Record<string, any> | null;
}

/**
 * Interface for step answers
 */
export interface StepAnswers {
  id: string;
  enrollment_id: string;
  step_number: number;
  answers: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for AI feedback
 */
export interface AIFeedback {
  id: string;
  enrollment_id: string;
  step_number: number;
  user_input: string;
  ai_feedback: string;
  feedback_rating: -1 | 0 | 1 | null;
  created_at: string;
}

/**
 * Service for managing program enrollments and progress
 */
export class ProgramService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get active enrollment for a user in a specific program
   */
  async getActiveEnrollment(
    userId: string,
    programId: string
  ): Promise<ProgramEnrollment | null> {
    const { data, error } = await this.supabase
      .from("program_enrollments")
      .select("*")
      .eq("user_id", userId)
      .eq("program_id", programId)
      .eq("status", "in_progress")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data;
  }

  /**
   * Get enrollment by ID
   */
  async getEnrollment(enrollmentId: string): Promise<ProgramEnrollment | null> {
    const { data, error } = await this.supabase
      .from("program_enrollments")
      .select("*")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data;
  }

  /**
   * Create a new program enrollment
   */
  async createEnrollment(params: {
    userId: string;
    programId: string;
    title?: string;
    description?: string;
    duration?: string;
    deviceInfo?: Record<string, any>;
  }): Promise<ProgramEnrollment> {
    const { data, error } = await this.supabase
      .from("program_enrollments")
      .insert({
        user_id: params.userId,
        program_id: params.programId,
        current_lesson: "Passo 1: Onde você está",
        duration: params.duration,
        device_info: params.deviceInfo || null,
        progress: 0,
        current_step: 0,
        status: "in_progress",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update enrollment progress
   */
  async updateProgress(
    enrollmentId: string,
    params: {
      progress: number;
      currentStep: number;
      currentLesson: string;
    }
  ): Promise<void> {
    const { error } = await this.supabase
      .from("program_enrollments")
      .update({
        progress: params.progress,
        current_step: params.currentStep,
        current_lesson: params.currentLesson,
        last_accessed_at: new Date().toISOString(),
      })
      .eq("id", enrollmentId);

    if (error) throw error;
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccess(enrollmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from("program_enrollments")
      .update({
        last_accessed_at: new Date().toISOString(),
      })
      .eq("id", enrollmentId);

    if (error) throw error;
  }

  /**
   * Save or update step answers (upsert)
   */
  async saveStepAnswers(
    enrollmentId: string,
    stepNumber: number,
    answers: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase.from("program_step_answers").upsert(
      {
        enrollment_id: enrollmentId,
        step_number: stepNumber,
        answers: answers,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "enrollment_id,step_number",
      }
    );

    if (error) throw error;
  }

  /**
   * Get all answers for an enrollment
   */
  async getEnrollmentAnswers(enrollmentId: string): Promise<StepAnswers[]> {
    const { data, error } = await this.supabase
      .from("program_step_answers")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .order("step_number", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get enrollment with all answers
   */
  async getEnrollmentWithAnswers(enrollmentId: string): Promise<{
    enrollment: ProgramEnrollment;
    answers: Record<string, any>;
  } | null> {
    // Fetch enrollment
    const { data: enrollment, error: enrollmentError } = await this.supabase
      .from("program_enrollments")
      .select("*")
      .eq("id", enrollmentId)
      .single();

    if (enrollmentError) throw enrollmentError;

    // Fetch answers
    const { data: answers, error: answersError } = await this.supabase
      .from("program_step_answers")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .order("step_number", { ascending: true });

    if (answersError) throw answersError;

    // Transform answers array into object keyed by step number
    const answersMap = (answers || []).reduce((acc, answer) => {
      acc[answer.step_number] = answer.answers;
      return acc;
    }, {} as Record<string, any>);

    return {
      enrollment,
      answers: answersMap,
    };
  }

  /**
   * Complete program enrollment
   */
  async completeEnrollment(enrollmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from("program_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        progress: 100,
      })
      .eq("id", enrollmentId);

    if (error) throw error;
  }

  /**
   * Abandon program enrollment
   */
  async abandonEnrollment(enrollmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from("program_enrollments")
      .update({
        status: "abandoned",
      })
      .eq("id", enrollmentId);

    if (error) throw error;
  }

  /**
   * Get user's enrollment history
   */
  async getUserEnrollmentHistory(userId: string): Promise<ProgramEnrollment[]> {
    const { data, error } = await this.supabase
      .from("program_enrollments")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Save AI feedback for a step
   */
  async saveAIFeedback(
    enrollmentId: string,
    stepNumber: number,
    userInput: string,
    aiFeedback: string
  ): Promise<AIFeedback> {
    const { data, error } = await this.supabase
      .from("program_ai_feedback")
      .insert({
        enrollment_id: enrollmentId,
        step_number: stepNumber,
        user_input: userInput,
        ai_feedback: aiFeedback,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get AI feedback history for an enrollment
   */
  async getAIFeedbackHistory(enrollmentId: string): Promise<AIFeedback[]> {
    const { data, error } = await this.supabase
      .from("program_ai_feedback")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Rate AI feedback
   */
  async rateAIFeedback(
    feedbackId: string,
    rating: -1 | 0 | 1
  ): Promise<void> {
    const { error } = await this.supabase
      .from("program_ai_feedback")
      .update({
        feedback_rating: rating,
      })
      .eq("id", feedbackId);

    if (error) throw error;
  }
}

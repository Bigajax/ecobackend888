// ==============================================================================
// IMPROVEMENTS TO ADD TO: server/core/ClaudeAdapter.ts
// ==============================================================================

// ============================================================================
// PART 1: ADD THESE CONSTANTS & FUNCTIONS BEFORE streamClaudeChatCompletion
// Location: Before line 252
// ============================================================================

/**
 * Retry configuration for empty SSE responses
 */
const EMPTY_RESPONSE_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 3000,
  backoffFactor: 2,
};

/**
 * Sleep helper for exponential backoff delays
 */
function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * Attempt 1 → 500ms
 * Attempt 2 → 1000ms
 * Attempt 3 → 2000ms
 */
function calculateBackoffDelay(attempt: number): number {
  const delay = EMPTY_RESPONSE_RETRY_CONFIG.initialDelayMs *
    Math.pow(EMPTY_RESPONSE_RETRY_CONFIG.backoffFactor, attempt - 1);
  return Math.min(delay, EMPTY_RESPONSE_RETRY_CONFIG.maxDelayMs);
}

// ============================================================================
// PART 2: REPLACE THE RESPONSE HANDLING SECTION
// Location: Lines 319-340 (resp = await request(); ... throw new Error(...))
// Replace from: let resp = await request();
// To: the code below
// ============================================================================

      let resp: Awaited<ReturnType<typeof fetch>>;
      try {
        // ===== DETAILED PRE-STREAM LOGGING =====
        log.debug("[attemptStream_start]", {
          model: modelToUse,
          stream: payload.stream,
          maxTokens: payload.max_tokens,
          temperature: payload.temperature,
          messageCount: payload.messages.length,
        });

        resp = await request();

        // ===== ENHANCED RESPONSE LOGGING =====
        const contentType = resp.headers.get("content-type") || "unknown";
        const contentLength = resp.headers.get("content-length");
        const transferEncoding = resp.headers.get("transfer-encoding");
        const isSse = /^text\/event-stream/i.test(contentType);

        log.debug("[attemptStream_response_headers]", {
          status: resp.status,
          ok: resp.ok,
          statusText: resp.statusText,
          contentType,
          contentLength,
          transferEncoding,
          isSse,
          allHeaders: {
            "content-type": resp.headers.get("content-type"),
            "content-length": resp.headers.get("content-length"),
            "transfer-encoding": resp.headers.get("transfer-encoding"),
            "cache-control": resp.headers.get("cache-control"),
            "connection": resp.headers.get("connection"),
            "date": resp.headers.get("date"),
          },
        });

        // ===== EARLY EMPTY RESPONSE VALIDATION =====
        // Check if response appears to be empty BEFORE processing
        if (resp.ok && contentLength === "0") {
          log.error("[empty_response_detected_early]", {
            model: modelToUse,
            status: resp.status,
            contentLength,
            isSse,
            reason: "Content-Length header is 0",
            shouldRetry: true,
          });

          // Create error that signals retry should be attempted
          const err = new Error("NON_SSE_EMPTY - Content-Length: 0");
          (err as any).__shouldRetry = true;
          (err as any).__claudeBeforeStream = true;
          (err as any).__claudeStreamDelivered = false;
          throw err;
        }

        // ===== PROCEED WITH RESPONSE PROCESSING =====
        if (!isSse) {
          const data: unknown = await resp.json().catch(() => null);
          const json = (isObject(data) ? (data as ORChatCompletion) : null);
          const text = json ? pickContent(json) : "";

          log.warn("[non_sse_fallback_processing]", {
            used: !!text,
            contentLength: text?.length || 0,
            model: modelToUse,
            hasJson: !!json,
            jsonKeys: json ? Object.keys(json) : [],
            rawContentType: contentType,
            statusOk: resp.ok,
          });

          if (text) {
            await callbacks.onChunk?.({ content: text, raw: json as any });
            await callbacks.onControl?.({ type: "done", finishReason: "fallback" });
            return;
          } else {
            log.error("[non_sse_empty]", {
              model: modelToUse,
              status: resp.status,
              contentType,
              contentLength,
              reason: "No content extracted from non-SSE response",
            });
            throw new Error("NON_SSE_EMPTY - No content in response");
          }
        }

// ============================================================================
// PART 3: REPLACE THE MAIN MODEL RETRY LOOP
// Location: Lines 553-576 (const modelsToTry = [model]; ... if (lastError) throw lastError;)
// Replace the entire for loop and error handling
// ============================================================================

  const modelsToTry = [model];
  if (fallbackModel && fallbackModel !== model) modelsToTry.push(fallbackModel);

  let lastError: Error | null = null;
  for (let i = 0; i < modelsToTry.length; i += 1) {
    const currentModel = modelsToTry[i]!;
    const isFinalAttempt = i === modelsToTry.length - 1;

    // ===== RETRY LOOP FOR EMPTY RESPONSES =====
    let retryAttempt = 0;
    let streamSuccess = false;

    while (retryAttempt < EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts && !streamSuccess) {
      retryAttempt += 1;

      try {
        log.debug("[stream_attempt_with_retry]", {
          model: currentModel,
          modelIndex: i,
          modelAttempt: `${i + 1}/${modelsToTry.length}`,
          retryAttempt,
          maxRetries: EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts,
        });

        await attemptStream(currentModel, isFinalAttempt);
        streamSuccess = true;
        return;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;
        const shouldRetry = (err as any).__shouldRetry === true;
        const delivered = (err as any).__claudeStreamDelivered === true;

        log.warn("[stream_attempt_failed]", {
          model: currentModel,
          retryAttempt,
          shouldRetry,
          delivered,
          error: err.message,
          errorName: err.name,
        });

        // If it's a retriable error and we have attempts left
        if (shouldRetry && retryAttempt < EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts) {
          const delayMs = calculateBackoffDelay(retryAttempt);
          log.warn("[retrying_with_backoff]", {
            model: currentModel,
            attempt: retryAttempt,
            nextRetryAfterMs: delayMs,
            error: err.message,
          });

          await sleepMs(delayMs);
          // Continue the while loop to retry
          continue;
        }

        // If we've exhausted retries or error should propagate immediately
        if (isFinalAttempt || delivered) {
          log.error("[final_model_failed]", {
            model: currentModel,
            isFinalAttempt,
            delivered,
            error: err.message,
          });
          throw err;
        }

        // Try the next model (fallback)
        const isTimeout = err instanceof ClaudeTimeoutError;
        const label = isTimeout ? "⏱️" : "⚠️";
        callbacks.onFallback?.(modelsToTry[i + 1]!);
        console.warn(
          `${label} Claude ${currentModel} falhou, tentando fallback ${modelsToTry[i + 1]}`,
          err
        );

        break; // Exit while loop, try next model in for loop
      }
    }

    // If stream succeeded, we return from attemptStream
    // If not, we continue to next model or throw
    if (streamSuccess) {
      return;
    }
  }

  // All models exhausted
  if (lastError) {
    log.error("[all_models_failed]", {
      models: modelsToTry,
      lastError: lastError.message,
    });
    throw lastError;
  }
}

// ==============================================================================
// EXPECTED LOG OUTPUTS
// ==============================================================================

/*
When everything works:
  [attemptStream_start] {model, stream, maxTokens, ...}
  [attemptStream_response_headers] {status: 200, ok: true, isSse: true, ...}
  [ClaudeAdapter] Stream completed ([DONE] received)

When NON_SSE_EMPTY occurs:
  [attemptStream_start] {model, stream, ...}
  [attemptStream_response_headers] {status: 200, ok: true, isSse: false, contentLength: "0", ...}
  [empty_response_detected_early] {reason: "Content-Length: 0", shouldRetry: true}
  [stream_attempt_failed] {error: "NON_SSE_EMPTY - Content-Length: 0", shouldRetry: true}
  [retrying_with_backoff] {attempt: 1, nextRetryAfterMs: 500}
  [stream_attempt_with_retry] {retryAttempt: 2, ...}
  ... (retry 2 and 3) ...
  [final_model_failed] or [retrying_with_backoff] with fallback model
*/

// ==============================================================================
// CHANGES SUMMARY
// ==============================================================================

/**
 * ADDITIONS:
 * 1. EMPTY_RESPONSE_RETRY_CONFIG - Config for retry behavior
 * 2. sleepMs() - Helper for delays
 * 3. calculateBackoffDelay() - Exponential backoff calculation
 * 4. Enhanced logging in attemptStream() response handling
 * 5. Early validation for Content-Length: 0
 * 6. Retry loop in main streamClaudeChatCompletion function
 * 7. Detailed error logging at each stage
 *
 * UNCHANGED:
 * - Fallback logic (still works same way)
 * - Callback interface (same)
 * - Error propagation (improved)
 * - Headers being sent (same)
 * - Model configuration (same)
 */

// ==============================================================================

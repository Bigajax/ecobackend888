# Streaming Bug Analysis & Fix

## Issue Summary

The error `NON_SSE_EMPTY` is occurring in `ClaudeAdapter.ts:337` when OpenRouter returns a non-SSE response with no parseable content. This causes an unhandled rejection because:

1. **ClaudeAdapter.ts:337** throws `Error("NON_SSE_EMPTY")`
2. The error is rethrown by `.catch()` at **line 675**
3. `streamPromise` becomes rejected
4. **streamingOrchestrator.ts:690** - `Promise.race()` is NOT wrapped in try-catch
5. Race immediately rejects with the `NON_SSE_EMPTY` error
6. This causes an **unhandledRejection** that crashes the process

## Root Cause

The `Promise.race()` at line 690 doesn't handle stream errors. When `streamPromise` rejects BEFORE the guard promise settles, the entire race rejects, and there's no catch handler.

```typescript
// Current problematic code (streamingOrchestrator.ts:690-706)
const raceOutcome = await Promise.race<"stream" | "fallback" | "guard_disabled">([
  streamPromise.then(() => {        // ← Can reject here
    streamCompleted = true;
    return "stream" as const;
  }),
  guardPromise,                      // ← No fallback if stream fails fast
]);

if (raceOutcome === "fallback") {    // ← Never reached if race rejects
  void streamPromise.catch(() => undefined);
  return fallbackResult ?? (await deliverFallbackFull());
}
```

## Solution

Wrap the race in a try-catch to handle stream errors gracefully:

```typescript
// Fixed code
let raceOutcome: "stream" | "fallback" | "guard_disabled" | "stream_error" = "stream";

try {
  raceOutcome = await Promise.race<"stream" | "fallback" | "guard_disabled">([
    streamPromise.then(() => {
      streamCompleted = true;
      return "stream" as const;
    }),
    guardPromise,
  ]);
} catch (error) {
  // If race rejects due to streamPromise error (e.g., NON_SSE_EMPTY)
  log.warn("[promise_race_error]", {
    error: error instanceof Error ? error.message : String(error),
    sawChunk,
  });
  raceOutcome = "stream_error";
}

// Handle stream_error case
if (raceOutcome === "stream_error") {
  // Stream error occurred, deliver fallback if no chunks received
  if (!sawChunk) {
    await emitFallbackOnce();
  }
  // Continue to finalization
}
```

## Changes Required

**File: `server/services/conversation/streamingOrchestrator.ts`**

### Location 1: Lines 686-706 (Promise.race setup)

Replace the `Promise.race()` call and initial race outcome checks with error handling.

### Location 2: Lines 708-712 (streamPromise await in try block)

Add stream error handling to the try block that awaits streamPromise.

## Why This Works

1. **Catches race rejection**: The try-catch around `Promise.race()` prevents unhandled rejections
2. **Graceful fallback**: When NON_SSE_EMPTY occurs (empty non-SSE response), we fall back to auto-generated response
3. **Preserves good chunks**: If some chunks were already delivered (`sawChunk = true`), we don't override them
4. **Continues finalization**: The rest of the pipeline continues normally, so SSE cleanup happens properly

## Testing

After applying the fix:

```bash
# Build and test
npm run build

# Test with debug logging
ECO_DEBUG=true npm run dev

# In another terminal, trigger the error scenario
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"mensagem": "test"}'
```

Expected behavior:
- No unhandledRejection error in console
- Fallback response delivered to client via SSE
- Stream completes cleanly with `done` event

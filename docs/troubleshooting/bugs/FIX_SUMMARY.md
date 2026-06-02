# Streaming Bug Fix Summary

**Date**: 2025-11-06
**Commit**: cc194a6
**Status**: ✅ Fixed and Committed

## Problem

After implementing `PATCH_STREAMING_NOTES`, the system was throwing unhandled rejections causing crashes:

```
[ERROR] [ask-eco] sse_unexpected {"trace_id":"..","message":"NON_SSE_EMPTY"}
[ERROR] unhandledRejection {"reason":{"name":"Error","message":"NON_SSE_EMPTY",...}}
⚠️ Claude ... falhou, tentando fallback Error: OpenRouter error: 400 Bad Request
```

## Root Cause

In `server/services/conversation/streamingOrchestrator.ts` at **lines 690-712**, the `Promise.race()` was not wrapped in a try-catch. When `streamPromise` rejected BEFORE the guard promise settled, the entire race reacted and crashed:

```typescript
// BEFORE (problematic):
const raceOutcome = await Promise.race([
  streamPromise.then(...),  // ← Could reject with NON_SSE_EMPTY
  guardPromise,
]);
// ↑ No error handler!
```

**Error flow:**
1. ClaudeAdapter:337 throws `Error("NON_SSE_EMPTY")`
2. ClaudeAdapter:675 rethrows the error
3. `streamPromise` becomes rejected
4. `Promise.race()` immediately rejects (no catch handler)
5. **Unhandled rejection** → process crash

## Solution

Wrapped `Promise.race()` in try-catch and added graceful fallback handling:

```typescript
// AFTER (fixed):
let raceOutcome: "stream" | "fallback" | "guard_disabled" | "stream_error" = "stream";

try {
  raceOutcome = await Promise.race([...]);
} catch (error) {
  log.warn("[promise_race_error]", { error: error.message, sawChunk });
  raceOutcome = "stream_error";  // ← New outcome state
}

// Handle stream_error gracefully
if (raceOutcome === "stream_error") {
  if (!sawChunk) {
    await emitFallbackOnce();  // ← Fallback response
  }
}
```

## Changes Made

**File**: `server/services/conversation/streamingOrchestrator.ts`

### 1. Promise.race Error Handling (lines 690-707)
- Wrapped `Promise.race()` in try-catch
- Added new `"stream_error"` outcome state
- Logs error with context for debugging

### 2. Guard Disabled Error Handling (lines 703-718)
- Wrapped `await streamPromise` in try-catch
- Catches errors if stream rejects after guard is disabled
- Sets `raceOutcome = "stream_error"` on failure

### 3. Stream Error Fallback (lines 724-732)
- Checks if `raceOutcome === "stream_error"`
- Emits fallback response if no chunks were received
- Allows finalization to continue normally

## Impact

✅ **Prevents unhandled rejections** - All stream errors are now caught
✅ **Graceful fallback** - Users get a response even on provider failure
✅ **Preserves good chunks** - Doesn't override partial responses
✅ **Maintains finalization** - Memory saving and analytics still work
✅ **Better debugging** - Logs captured error details

## Testing

The fix was:
1. ✅ Compiled without TypeScript errors
2. ✅ Changes verified against the exact diff
3. ✅ Committed to main branch with detailed message

To test in production:
```bash
# Monitor logs for the new error events:
# [promise_race_error] - when race rejects due to stream error
# [guard_disabled_stream_error] - when stream fails after guard disabled

# Trigger a test request:
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"mensagem": "test"}'

# Expected: Fallback response delivered, no unhandledRejection
```

## Related Issues

The bug manifested after `PATCH_STREAMING_NOTES` which implemented word-boundary buffering. The word buffering itself is fine - the issue was the unprotected `Promise.race()` when streams fail.

## Files Changed

- `server/services/conversation/streamingOrchestrator.ts` (+36, -11 lines)

## Git Info

```
Commit: cc194a6
Author: Bigajax (via Claude Code)
Branch: main
```

---

## Rollback (if needed)

```bash
git revert cc194a6
npm run build
```

---

**Next Steps**: Monitor production logs for `[promise_race_error]` events to verify the fix is working as expected. The new error state should prevent crashes and deliver fallback responses instead.

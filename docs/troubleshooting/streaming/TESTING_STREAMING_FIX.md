# Testing the Streaming Bug Fix

## Overview

This guide helps you verify that the streaming error handling fix works correctly.

## What We Fixed

The fix prevents unhandled rejections when:
1. **NON_SSE_EMPTY** - OpenRouter returns a non-SSE response with no content
2. **Stream errors** - Any error from the Claude provider occurs before the guard promise settles
3. **Connection failures** - Provider timeouts or network issues

## Test Scenarios

### Scenario 1: Normal Streaming (Positive Test)

**Expected**: Response streams successfully with word-boundary buffering

```bash
# Start the server
npm run dev  # or: NODE_ENV=development npx ts-node --transpile-only server/server.ts

# In another terminal, send a request
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"mensagem": "Olá! Como você está?"}'
```

**What to look for**:
- ✅ SSE stream starts with `event: control` with `prompt_ready`
- ✅ Multiple `event: chunk` events with text content
- ✅ Stream ends with `event: done`
- ✅ No unhandledRejection errors in console

### Scenario 2: Stream Error Handling (Testing the Fix)

**Expected**: When a stream fails, fallback response is delivered instead of crashing

This happens naturally when:
- OpenRouter returns 400/500 error
- Provider times out
- Network connection is lost

**Watch for in logs**:
```
[promise_race_error] - indicates race caught a stream error
[guard_disabled_stream_error] - indicates error after guard was disabled
[guard_fallback_missing_chunk] - indicates fallback was triggered
```

### Scenario 3: With Debug Logging

**Expected**: Detailed logs showing the error handling flow

```bash
ECO_DEBUG=true npm run dev

# In another terminal
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"mensagem": "test"}'
```

**Look for these log entries**:
```
[ClaudeAdapter] Stream completed ([DONE] received)
[ECO-SSE] chunk enviado
[promise_race_error] (if stream fails)
[guard_disabled_stream_error] (if error after guard)
[ask-eco] done (final SSE completion)
```

## Verification Checklist

- [ ] Build completes without TypeScript errors
  ```bash
  npm run build
  ```

- [ ] No new TypeScript errors in streamingOrchestrator.ts
  ```bash
  npx tsc --noEmit server/services/conversation/streamingOrchestrator.ts
  ```

- [ ] Normal requests complete successfully
  ```bash
  curl -X POST http://localhost:3001/api/ask-eco \
    -H "Content-Type: application/json" \
    -d '{"mensagem": "Hello"}'
  ```

- [ ] Error responses don't cause unhandled rejections
  - Check browser/client console for no unhandledRejection errors
  - Check server logs for graceful error handling

- [ ] SSE cleanup happens properly
  - Stream should end with `[done] event`
  - No hanging connections
  - Timers are properly cleared

## Code Review

The fix modifies the Promise.race handling in three places:

**1. Race Error Catch** (lines 697-707):
```typescript
try {
  raceOutcome = await Promise.race(...);
} catch (error) {
  log.warn("[promise_race_error]", {...});
  raceOutcome = "stream_error";
}
```

**2. Guard Disabled Error Catch** (lines 714-721):
```typescript
if (raceOutcome === "guard_disabled") {
  try {
    await streamPromise;
    // ...
  } catch (error) {
    log.warn("[guard_disabled_stream_error]", {...});
    raceOutcome = "stream_error";
  }
}
```

**3. Stream Error Fallback** (lines 726-732):
```typescript
if (raceOutcome === "stream_error") {
  if (!sawChunk) {
    await emitFallbackOnce();
  }
}
```

## Performance Impact

- **Negligible**: Only adds try-catch blocks, no new loops or allocations
- **Error cases**: ~50ms additional time to emit fallback response
- **Happy path**: No change to streaming performance

## Monitoring

### Production Logs to Watch For

```bash
# Look for new error states
grep "\[promise_race_error\]" logs/*.log
grep "\[guard_disabled_stream_error\]" logs/*.log

# Count occurrences
grep -c "\[promise_race_error\]" logs/*.log
```

### Metrics to Track

- Error rate for stream failures (should have fallback now)
- First-token latency (should be unaffected)
- Memory usage (should be unaffected)
- SSE event count (should be same as before)

## Rollback Procedure

If needed, rollback in 2 minutes:

```bash
git revert cc194a6
npm run build
npm restart  # or deploy
```

## Questions?

See:
- `FIX_SUMMARY.md` - Full explanation of the bug and fix
- `STREAMING_FIX_ANALYSIS.md` - Technical analysis
- `git log cc194a6` - Commit details

---

**Last Updated**: 2025-11-06
**Status**: Ready for testing

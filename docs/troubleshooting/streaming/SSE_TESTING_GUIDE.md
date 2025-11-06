# SSE Testing Guide - ECO Backend

## Quick Verification Tests

### Test 1: Single prompt_ready Event
**Objective**: Verify only ONE prompt_ready event is emitted

**Steps**:
```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Make test request
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","clientMessageId":"test-1"}' \
  --no-buffer 2>&1 | head -50
```

**Expected Output**:
```
event: control
data: {"type":"prompt_ready","streamId":"<UUID>","name":"prompt_ready","at":<number>,"sinceStartMs":<number>,"client_message_id":"test-1"}

event: control
data: {"type":"stream_metadata",...}

event: chunk
data: {...,"streamId":"<UUID>"...}
```

**Verify**:
- ✅ Only ONE `event: control` with `"type":"prompt_ready"` at the start
- ✅ `streamId` is a UUID
- ✅ `client_message_id` matches what was sent
- ✅ All subsequent events have the same `streamId`

### Test 2: Heartbeat Messages
**Objective**: Verify keepalive heartbeats every 12 seconds

**Steps**:
```bash
# Make request and capture events for 30+ seconds
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me a long story","clientMessageId":"test-2"}' \
  --no-buffer 2>&1 | cat -n | head -100
```

**Expected Pattern** (sample output):
```
     1  : ok
     2
     3  event: control
     4  data: {"type":"prompt_ready",...}
     ...
    10  event: chunk
    11  data: {...}
    12
    20  :keepalive
    21
    35  event: chunk
    36  data: {...}
    37
    40  :keepalive        ← 12s later
    41
    ...
    65  :keepalive        ← 12s later
    66
```

**Verify**:
- ✅ `:keepalive` comments appear roughly every 12 seconds
- ✅ During long silence, keepalives prevent timeout
- ✅ No other events between keepalives

### Test 3: streamId Presence in All Events
**Objective**: Verify streamId is in every event

**Steps**:
```bash
# Parse SSE and check streamId in each event
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test-3"}' \
  --no-buffer 2>&1 | \
  awk '/^event:/ { event=$2 } /^data:/ {
    if ($0 ~ /"streamId"/) print "✓ " event " has streamId"
    else print "✗ " event " MISSING streamId"
  }'
```

**Expected Output**:
```
✓ control has streamId
✓ chunk has streamId
✓ chunk has streamId
✓ chunk has streamId
✓ control has streamId
```

**Verify**:
- ✅ All events show `✓ streamId` present
- ✅ No `✗ MISSING` lines

### Test 4: streamId in Response Header
**Objective**: Verify X-Stream-Id header is set

**Steps**:
```bash
curl -i -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test-4"}' \
  2>&1 | grep -i "x-stream-id"
```

**Expected Output**:
```
x-stream-id: <UUID>
```

**Verify**:
- ✅ Header is present
- ✅ Value is a valid UUID

### Test 5: Duplicate Stream Handling
**Objective**: Verify graceful handling when two requests use same streamId

**Steps**:
```bash
# Terminal 1: Start first request
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "X-Stream-Id: same-stream-id" \
  -d '{"message":"First message","clientMessageId":"dup-1"}' \
  --no-buffer 2>&1 &

FIRST_PID=$!
sleep 1

# Terminal 1 (continued): Start second request with SAME stream ID
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "X-Stream-Id: same-stream-id" \
  -d '{"message":"Second message","clientMessageId":"dup-2"}' \
  --no-buffer 2>&1

wait $FIRST_PID
```

**Expected Behavior**:
- ✅ First request starts receiving chunks
- ✅ Second request with same ID starts its own stream
- ✅ First request terminates with `finish_reason: "replaced_by_new_stream"`
- ✅ No errors logged on either stream
- ✅ Second request completes normally

**Verify in logs**:
```
[ask-eco] sse_stream_replaced { streamId: 'same-stream-id' }
```

### Test 6: Buffering Prevention Headers
**Objective**: Verify SSE headers prevent buffering

**Steps**:
```bash
curl -i -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test-6"}' \
  2>&1 | head -20
```

**Expected Headers**:
```
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

**Verify**:
- ✅ `Content-Type: text/event-stream`
- ✅ `Cache-Control: no-cache, no-transform`
- ✅ `X-Accel-Buffering: no`
- ✅ No `Content-Encoding` header
- ✅ No `Content-Length` header

### Test 7: First Token Timeout (Advanced)
**Objective**: Verify first token watchdog works

**Setup**:
```bash
# Set shorter timeout for testing
export ECO_FIRST_TOKEN_TIMEOUT_MS=3000
npm run dev
```

**Steps**:
```bash
# Use a message that will trigger timeout (e.g., very heavy load)
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"A" | head -c 100000}' \
  --no-buffer 2>&1
```

**Expected Behavior** (after 3 seconds):
- Stream either:
  1. Receives first chunk before timeout (success)
  2. Triggers fallback response (timeout handled)
- No hanging connection

### Test 8: Idle Timeout (Advanced)
**Objective**: Verify idle timeout closes stale connections

**Setup**:
```bash
# Set shorter timeout for testing
export ECO_SSE_TIMEOUT_MS=10000
npm run dev
```

**Steps**:
```bash
# Make request and wait for connection to timeout
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test-8"}' \
  --max-time 20 \
  --no-buffer 2>&1
```

**Expected Behavior**:
- Connection closes after ~10 seconds of inactivity
- No "Connection reset by peer" errors
- Proper `done` event with `finish_reason: "stream_timeout"` or similar

## Advanced Testing

### Load Test: Concurrent Streams
**Objective**: Verify SSE robustness under load

**Script**:
```bash
#!/bin/bash
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/ask-eco \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"Message $i\",\"clientMessageId\":\"load-$i\"}" \
    --no-buffer > /tmp/stream_$i.txt 2>&1 &
done
wait
```

**Verify**:
- ✅ All 10 streams complete successfully
- ✅ No connection errors
- ✅ Each has unique streamId
- ✅ Proper resource cleanup (check `/api/health` active_streams)

### Monitoring Active Streams
**Objective**: Verify stream count and health metrics

**Steps**:
```bash
# Make a request
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"monitor-1"}' \
  --no-buffer > /dev/null 2>&1 &

# Check health endpoint
sleep 1
curl http://localhost:3001/api/health | jq '.sse'
```

**Expected Output**:
```json
{
  "active_sessions": 1,
  "module_count": 42,
  "modules_loaded": true
}
```

**Verify**:
- ✅ `active_sessions` increases during request
- ✅ Returns to 0 after stream completes
- ✅ No orphaned sessions

### Log Analysis
**Objective**: Verify proper logging of SSE lifecycle

**Steps**:
```bash
# Run with debug enabled
ECO_DEBUG=true npm run dev 2>&1 | grep "\[ask-eco\]"
```

**Expected Log Sequence**:
```
[ask-eco] sse_ready { streamId: '...' }
[ask-eco] prompt_ready_sent { streamId: '...' }
[ask-eco] first_token_latency { latencyMs: 123 }
[ask-eco] chunk_received { index: 0, streamId: '...' }
[ask-eco] chunk_received { index: 1, streamId: '...' }
...
[ask-eco] sse_summary { chunks_emitted: 42, finish_reason: 'stop' }
```

**Verify**:
- ✅ `sse_ready` appears once
- ✅ `prompt_ready_sent` appears once (after bootstrap)
- ✅ `first_token_latency` shows reasonable time (<35s)
- ✅ Chunks numbered sequentially
- ✅ Summary shows proper cleanup

## Automated Test Suite

### Running Existing Tests
```bash
# Unit tests
npm test

# Run specific SSE tests
npm test -- --testNamePattern="sse|stream|ask-eco"

# Integration tests
npm run test:supabase

# Smoke tests
npm run shadow:smoke
npm run pilot:smoke
```

### Creating New Test Cases
Add to `server/tests/contract/askEco.sse.spec.ts`:

```typescript
describe("SSE prompt_ready consolidation", () => {
  it("should emit single prompt_ready event with streamId", async () => {
    const events = [];
    const response = await fetch('/api/ask-eco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });

    const reader = response.body.getReader();
    // Parse events...

    const promptReadyEvents = events.filter(e => e.type === 'prompt_ready');
    expect(promptReadyEvents).toHaveLength(1);
    expect(promptReadyEvents[0].streamId).toBeDefined();
  });

  it("should include streamId in all events", async () => {
    // Similar implementation...
  });

  it("should handle duplicate streams gracefully", async () => {
    // Similar implementation...
  });
});
```

## Troubleshooting

### Issue: "ready_timeout" Still Occurring
**Possible Causes**:
1. `prompt_ready` event not being received
2. Proxy buffering first event
3. Network latency >35s

**Solution**:
```bash
# Check logs for event emission
ECO_DEBUG=true npm run dev 2>&1 | grep "prompt_ready"

# Verify headers are sent immediately
curl -v -X POST ... 2>&1 | head -20

# Check network latency
time curl -X POST ... > /dev/null
```

### Issue: Duplicate prompt_ready Events
**Possible Causes**:
1. Old code still running (restart server)
2. Browser cache
3. EventSource retry behavior

**Solution**:
```bash
# Restart with clean state
pkill -f "node.*server.ts"
npm run dev

# Clear browser cache or use incognito
```

### Issue: Heartbeat Not Appearing
**Possible Causes**:
1. `pingIntervalMs` set to 0 or negative
2. Connection closed before heartbeat scheduled
3. Events arriving too frequently

**Solution**:
```bash
# Check env variable
echo $ECO_SSE_PING_INTERVAL_MS

# Verify heartbeat starts after prompt_ready
ECO_DEBUG=true npm run dev 2>&1 | grep "heartbeat"
```

### Issue: streamId Not in Events
**Possible Causes**:
1. Old version of sseEvents.ts
2. Build not compiled
3. Using fallback JSON endpoint

**Solution**:
```bash
# Clean rebuild
npm run build

# Verify sseEvents.ts has streamId line 178
grep -n "streamId," server/sse/sseEvents.ts | head -5

# Check response is SSE not JSON
curl ... | head -3 | grep "event:"
```

## Performance Baseline

### Expected Metrics
- **Time to prompt_ready**: <500ms (after bootstrap)
- **First token latency**: 1-5s (typical)
- **Chunk delivery**: <100ms per chunk
- **Heartbeat interval**: 12s ±100ms
- **Memory per stream**: ~50-100KB
- **Connection count**: Stable, no leaks

### Monitoring Commands
```bash
# CPU and memory during load
watch -n 1 'ps aux | grep "node.*server.ts"'

# Open connections
lsof -p $(pgrep -f "node.*server.ts") | grep TCP

# Event throughput (events/sec)
curl ... 2>&1 | grep "^event:" | wc -l

# Data throughput (bytes/sec)
curl ... 2>&1 | wc -c
```

## Acceptance Criteria

Stream is considered **robust** when:
- [ ] No duplicate prompt_ready events
- [ ] streamId in ALL events
- [ ] Heartbeats every 12s during long processing
- [ ] Duplicate streams handled gracefully
- [ ] No buffer delays on typical proxies
- [ ] First token within 35s or proper fallback
- [ ] Idle timeout after 55s no activity
- [ ] Proper resource cleanup after completion
- [ ] No connection leaks under load
- [ ] All timeouts configurable via env

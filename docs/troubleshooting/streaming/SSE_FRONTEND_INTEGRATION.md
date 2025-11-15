# SSE Frontend Integration Guide - ECO Backend

## Quick Reference for Frontend Implementation

### Event Structure
Every SSE event now includes a `streamId` for client-side filtering:

```typescript
interface SseEvent {
  type: string;      // Event type: "prompt_ready", "chunk", "done", etc.
  streamId: string;  // ✅ ALWAYS present - unique identifier for this stream
  [key: string]: any; // Event-specific fields
}
```

### Expected Event Sequence

```
1. prompt_ready (with streamId in body + X-Stream-Id header)
   └─ Signals connection is ready
   └─ Contains: streamId, client_message_id, at, sinceStartMs

2. :keepalive (SSE comment, appears every 12 seconds)
   └─ Signals connection is alive, no timeout yet
   └─ Safe to ignore

3. chunk (repeated, contains response text)
   └─ Contains: delta (text), index (ordering), streamId
   └─ Use index for ordering, not arrival time

4. control or memory_saved (if emotional intensity ≥7)
   └─ Contains: memory_id, streamId

5. done (final event)
   └─ Contains: content, tokens, finish_reason, streamId
   └─ Signals stream is complete

6. Connection closes
```

### Implementation Pattern

#### Basic Event Handling
```typescript
import { useEffect, useState } from 'react';

function useEcoStream(message: string) {
  const [response, setResponse] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;

    setLoading(true);
    setError(null);
    setResponse('');

    const clientMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    fetch('/api/ask-eco', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: provide streamId to resume stream
        'X-Stream-Id': streamId || undefined,
      },
      body: JSON.stringify({
        message,
        clientMessageId,
      }),
    })
      .then(response => {
        // Capture streamId from response header
        const responseStreamId = response.headers.get('x-stream-id');
        if (responseStreamId) {
          setStreamId(responseStreamId);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processChunk = async () => {
          const { done, value } = await reader.read();
          if (done) return;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');

          // Keep last incomplete line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            if (line.startsWith(':')) {
              // Comment (heartbeat) - ignore
              console.debug('Heartbeat:', line);
              continue;
            }

            if (line.startsWith('event: ')) {
              const eventType = line.slice(7);
              // Next line will have the data
              continue;
            }

            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));

                // Filter events by streamId to ignore orphaned events
                if (eventData.streamId !== responseStreamId) {
                  console.debug('Ignoring orphaned event from old stream:', eventData.streamId);
                  continue;
                }

                handleEvent(eventData);
              } catch (e) {
                console.error('Failed to parse event:', line, e);
              }
            }
          }

          return processChunk();
        };

        return processChunk();
      })
      .catch(err => {
        setError(err.message);
        console.error('Stream error:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [message]);

  const handleEvent = (event: any) => {
    switch (event.type) {
      case 'prompt_ready':
        console.log('Stream ready at:', event.at);
        break;

      case 'chunk':
        // event.delta contains the text
        // event.index is for ordering if chunks arrive out-of-order
        setResponse(prev => prev + (event.delta || ''));
        break;

      case 'control':
        if (event.name === 'prompt_ready') {
          console.log('Connection ready');
        }
        break;

      case 'done':
        console.log('Stream completed:', {
          tokens: event.tokens,
          finishReason: event.finish_reason,
        });
        break;

      case 'error':
        setError(event.message || 'Unknown error');
        break;

      default:
        console.debug('Unknown event type:', event.type);
    }
  };

  return { response, loading, error, streamId };
}

// Usage
export function EcoChat() {
  const [message, setMessage] = useState('');
  const { response, loading, error, streamId } = useEcoStream(message);

  return (
    <div>
      <input
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Chat with Eco..."
      />
      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Waiting for response...</div>}
      <div className="response">{response}</div>
      {streamId && <small>Stream: {streamId.slice(0, 8)}...</small>}
    </div>
  );
}
```

#### Handling Duplicate/Abort Scenarios
```typescript
function useEcoStreamWithAbort(message: string) {
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [response, setResponse] = useState('');

  const startStream = useCallback((msg: string) => {
    // Cancel previous stream if still running
    if (abortController) {
      abortController.abort();
    }

    const newController = new AbortController();
    setAbortController(newController);

    fetch('/api/ask-eco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
      signal: newController.signal,
    })
      .then(/* ... stream handling ... */)
      .catch(err => {
        if (err.name === 'AbortError') {
          console.log('Stream was cancelled (replaced by new request)');
        } else {
          throw err;
        }
      });
  }, [abortController]);

  return { startStream, response };
}
```

#### Handling Timeouts
```typescript
function useEcoStreamWithTimeout(message: string, timeoutMs = 45000) {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const startTime = Date.now();

    fetch('/api/ask-eco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
      .then(async response => {
        // Reset timeout on every event received
        if (timeoutId) clearTimeout(timeoutId);

        const reader = response.body?.getReader();
        if (!reader) return;

        const watchdog = setTimeout(() => {
          reader.cancel('Timeout waiting for stream');
          console.error('Stream timeout - no data for 30 seconds');
        }, 30000);

        // Process events...
        // Every event received resets the watchdog
      })
      .catch(err => {
        if (timeoutId) clearTimeout(timeoutId);
        // Handle error
      });
  }, [message]);

  return { /* ... */ };
}
```

### Handling Chunk Ordering
```typescript
// If chunks arrive out of order, use the index field
function useEcoStreamWithOrdering(message: string) {
  const [chunks, setChunks] = useState<Array<{ index: number; text: string }>>([]);

  const handleChunkEvent = (event: any) => {
    setChunks(prev => {
      const updated = [...prev];
      updated[event.index] = {
        index: event.index,
        text: event.delta,
      };
      return updated;
    });
  };

  // Assemble final text in order
  const orderedText = chunks
    .sort((a, b) => a.index - b.index)
    .map(c => c.text)
    .join('');

  return { orderedText };
}
```

### Frontend Checklist

When integrating SSE:
- [ ] Capture `X-Stream-Id` header from response
- [ ] Filter events by `streamId` to ignore orphaned events
- [ ] Handle `:keepalive` comments (don't treat as errors)
- [ ] Use chunk `index` field for ordering, not arrival time
- [ ] Implement timeout (35s for first_token, 45s total)
- [ ] Handle abort/cancel properly with AbortController
- [ ] Parse JSON payload correctly (event data is JSON string)
- [ ] Handle error events gracefully
- [ ] Test with slow networks/high latency
- [ ] Test with concurrent message submissions
- [ ] Verify proper cleanup when component unmounts

### Common Issues & Solutions

**Issue**: "Events arriving without streamId"
- **Cause**: Using old backend version
- **Solution**: Ensure backend is updated and restarted
- **Check**: `grep "streamId," server/sse/sseEvents.ts`

**Issue**: "Two prompt_ready events received"
- **Cause**: Old backend version with duplicate emission
- **Solution**: Update backend and rebuild
- **Check**: `npm run build && npm start`

**Issue**: "Stream ends prematurely with 'replaced_by_new_stream'"
- **Cause**: New message sent while previous stream still running
- **Solution**: This is expected behavior. Filter by `streamId`
- **Check**: Log shows old streamId ended, new streamId started

**Issue**: "Connection timeout even with heartbeats"
- **Cause**: Proxy buffering, or client-side timeout too short
- **Solution**:
  - Increase client timeout to 45+ seconds
  - Check proxy settings (`X-Accel-Buffering: no` should be present)

**Issue**: "Chunks arriving out of order"
- **Cause**: Network packet reordering
- **Solution**: Always sort by chunk `index` field before assembling

## Performance Optimization Tips

### 1. Stream Deduplication
```typescript
// Keep track of current stream
let currentStreamId: string | null = null;

function startNewMessage(message: string) {
  // Cancel any existing stream
  if (currentStreamId) {
    // The backend will handle cleanup
  }

  // Start new stream
  fetch('/api/ask-eco', {...})
    .then(res => {
      const newStreamId = res.headers.get('x-stream-id');
      currentStreamId = newStreamId;
      // ...
    });
}
```

### 2. Chunking Assembly
```typescript
// Efficient assembly using array + join
const textChunks: string[] = [];

const handleChunk = (event: any) => {
  textChunks[event.index] = event.delta;
};

const getFinalText = () => {
  // Fill gaps with empty strings if needed
  return textChunks.filter(Boolean).join('');
};
```

### 3. Memory Management
```typescript
// Clear buffers when stream ends
function useEcoStream(message: string) {
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      setResponse('');
      setError(null);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
}
```

## Deployment Checklist

Before deploying frontend that uses new SSE:
- [ ] Backend is at latest version with fixes
- [ ] Backend is rebuilt: `npm run build`
- [ ] Frontend captures X-Stream-Id header
- [ ] Frontend filters events by streamId
- [ ] Frontend handles :keepalive comments
- [ ] Tests pass with new SSE format
- [ ] Load test with multiple concurrent streams
- [ ] Monitor error rates in production for first week
- [ ] Have rollback plan if issues arise

## Support & Debugging

### Enable Verbose Logging (Frontend)
```typescript
const DEBUG = true;

const handleEvent = (event: any) => {
  if (DEBUG) {
    console.log('[SSE Event]', {
      type: event.type,
      streamId: event.streamId?.slice(0, 8),
      keys: Object.keys(event).slice(0, 5),
    });
  }
  // ...
};
```

### Monitor Stream Health (Server)
```bash
# Watch active streams
watch -n 1 'curl -s http://localhost:3001/api/health | jq ".sse"'

# Follow SSE logs
npm run dev 2>&1 | grep "\[ask-eco\]"

# Check for orphaned streams
npm run dev 2>&1 | grep "orphan\|replaced\|timeout"
```

### Network Inspection
```bash
# Capture SSE traffic
curl -v -X POST http://localhost:3001/api/ask-eco ... 2>&1 | head -50

# Check headers are correct
curl -i -X POST ... 2>&1 | grep -E "^[A-Z-]+:"

# Monitor response latency
time curl -X POST ... > /dev/null
```

# Backend Text Passthrough - Sanitization Removed

## Overview

All text sanitization, formatting, normalization, and processing logic has been **completely removed from the backend**. The backend now sends raw text from Claude/OpenRouter directly to the client without any transformation.

## Responsibility Transfer

- **Backend**: Raw passthrough only
- **Frontend**: 100% responsible for sanitization, formatting, and text processing

## Changes Made

### 1. **sseEvents.ts** - Removed chunk processing
- ❌ Removed `sanitizeOutput()` calls
- ❌ Removed `minChunkBuffer` buffering logic (was used to accumulate small chunks)
- ❌ Removed `MIN_CHUNK_LENGTH` policy (3-character minimum chunks)
- ❌ Removed UTF-8 validation and replacement character detection
- ❌ Removed "OK" text filtering
- ✅ Text sent raw directly without any transformation

### 2. **promptRoutes.ts** - Removed JSON response sanitization
- ❌ Removed `sanitizeOutput()` imports and calls
- ❌ Removed sanitization from both SSE and JSON fallback modes
- ✅ Now calls `extractTextLoose()` directly without post-processing

### 3. **textExtractor.ts** - Simplified extraction
- ❌ Removed `sanitizeOutput()` function entirely
  - Was removing JSON blocks (```json ... ```)
  - Was removing trailing JSON objects
  - Was removing control characters
- ❌ Removed `.trim()` from `extractTextLoose()`
  - Now returns text as-is without trimming whitespace
- ✅ `extractEventText()` still normalizes `\r\n` → `\n` (minimal necessity)

### 4. **ClaudeAdapter.ts** - Simplified text normalization
- ❌ Removed all trimming and space-insertion logic from `normalizeOpenRouterText()`
- ❌ Removed conditional filtering (`filter(p => p.length > 0)`)
- ❌ Removed conditional space joining (was `join(" ")` for arrays)
- ✅ Now simply concatenates all pieces without transformation

## Text Flow Path

```
OpenRouter API
    ↓
normalizeOpenRouterText() [raw concatenation only]
    ↓
extractTextLoose() [no trimming]
    ↓
extractEventText() [only \r\n → \n conversion]
    ↓
sendChunk() [raw send, no sanitizeOutput]
    ↓
SSE Event to Client
    ↓
Frontend Responsibility [sanitization, formatting, display]
```

## Files NOT Modified

- **textUtils.ts**: Functions like `extractMeaningfulTokens()`, `extractKeywords()` remain unchanged
  - These are used for internal analysis, not output transformation
- **feedbackController.ts**: Contains heuristics functions, not output transformation
- **heuristicsV2.ts**: Decision logic, not text transformation

## Testing Considerations

- Backend tests expecting sanitized output need updates
- No more "cleaned" text expectations
- Raw text with spaces, newlines, and special characters should pass through
- JSON blocks in LLM output will now reach the client (frontend responsibility to handle)

## Frontend Implementation Notes

The frontend must now handle:

1. **JSON Block Removal**
   ```javascript
   text.replace(/```(?:json)?[\s\S]*?```/gi, "")
   ```

2. **Control Character Removal**
   ```javascript
   text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
   ```

3. **Spacing Normalization** (if needed)
   ```javascript
   text.replace(/\r\n/g, "\n")
   ```

4. **Trimming** (if needed)
   ```javascript
   text.trim()
   ```

## Benefits

- ✅ Backend simpler and faster (no text processing)
- ✅ Reduced server load
- ✅ No data loss from aggressive filtering
- ✅ Frontend has full control over presentation
- ✅ Easier debugging (raw unmodified text)
- ✅ Better separation of concerns

## Migration Checklist

- [x] Remove sanitizeOutput function and calls
- [x] Remove chunk buffering logic
- [x] Remove UTF-8 validation
- [x] Remove text trimming from extraction
- [x] Remove conditional space joining
- [x] Verify TypeScript compilation succeeds
- [ ] Update frontend to handle all sanitization
- [ ] Test with various edge cases (unicode, control chars, JSON blocks)
- [ ] Update tests to expect raw text

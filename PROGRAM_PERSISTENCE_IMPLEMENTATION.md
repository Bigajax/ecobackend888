# Program Persistence System - Implementation Guide

## Overview

This implementation adds backend persistence and synchronization for the "Quem Pensa Enriquece" program, transforming it from a localStorage-only experience to a cloud-first system with automatic sync across devices.

## What Was Implemented

### Backend Components

1. **Database Schema** (`supabase/migrations/001_create_program_tables.sql`)
   - `program_enrollments` - User program enrollments with progress tracking
   - `program_step_answers` - User answers for each step (flexible JSONB storage)
   - `program_ai_feedback` - AI feedback history (optional, for future use)
   - Row Level Security (RLS) policies for data isolation
   - Indexes for performance optimization

2. **Service Layer** (`server/services/ProgramService.ts`)
   - `ProgramService` class with methods for all database operations
   - Type-safe interfaces for enrollment, answers, and feedback
   - Upsert support for auto-save functionality
   - Ownership verification built into service methods

3. **Controller Layer** (`server/controllers/programsController.ts`)
   - RESTful endpoint handlers with authentication
   - Input validation and error handling
   - Logging for debugging and analytics
   - Proper HTTP status codes

4. **Routes** (`server/routes/programRoutes.ts`)
   - All routes protected by `requireAuth` middleware
   - RESTful API design following existing patterns

## API Endpoints

### Base Path: `/api/programs`

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

#### 1. Start Program
```http
POST /api/programs/start
Content-Type: application/json

{
  "programId": "rec_2",
  "title": "Quem Pensa Enriquece",
  "description": "...",
  "duration": "25 min",
  "deviceInfo": { ... }  // optional
}
```

**Response (201 - New):**
```json
{
  "enrollmentId": "uuid-here",
  "programId": "rec_2",
  "progress": 0,
  "currentStep": 0,
  "currentLesson": "Passo 1: Onde você está",
  "startedAt": "2026-02-05T10:00:00Z",
  "status": "in_progress"
}
```

**Response (200 - Resume):**
```json
{
  "enrollmentId": "existing-uuid",
  "programId": "rec_2",
  "progress": 50,
  "currentStep": 2,
  "currentLesson": "Passo 3: O que te puxa de volta",
  "startedAt": "2026-02-05T09:00:00Z",
  "lastAccessedAt": "2026-02-05T09:30:00Z",
  "status": "in_progress",
  "resuming": true
}
```

#### 2. Get Enrollment
```http
GET /api/programs/:enrollmentId
```

**Response (200):**
```json
{
  "enrollmentId": "uuid",
  "programId": "rec_2",
  "progress": 50,
  "currentStep": 2,
  "currentLesson": "Passo 3: O que te puxa de volta",
  "answers": {
    "1": { "step1": "sempre falta no fim do mês" },
    "2": { "step2": "ter reserva de 6 meses" }
  },
  "startedAt": "2026-02-05T09:00:00Z",
  "lastAccessedAt": "2026-02-05T09:30:00Z",
  "completedAt": null,
  "status": "in_progress"
}
```

#### 3. Update Progress
```http
PUT /api/programs/:enrollmentId/progress
Content-Type: application/json

{
  "progress": 33,
  "currentStep": 1,
  "currentLesson": "Passo 2: O que você quer"
}
```

**Response (200):**
```json
{
  "success": true,
  "progress": 33,
  "currentStep": 1,
  "currentLesson": "Passo 2: O que você quer",
  "lastAccessedAt": "2026-02-05T10:00:00Z"
}
```

#### 4. Save Answers (Auto-Save)
```http
POST /api/programs/:enrollmentId/answers
Content-Type: application/json

{
  "stepNumber": 1,
  "answers": {
    "step1": "sempre falta no fim do mês..."
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "saved": true,
  "updatedAt": "2026-02-05T10:05:00Z"
}
```

#### 5. Complete Program
```http
POST /api/programs/:enrollmentId/complete
```

**Response (200):**
```json
{
  "success": true,
  "status": "completed",
  "completedAt": "2026-02-05T11:00:00Z",
  "totalTimeMinutes": 60
}
```

#### 6. Abandon Program
```http
POST /api/programs/:enrollmentId/abandon
```

**Response (200):**
```json
{
  "success": true,
  "status": "abandoned"
}
```

#### 7. Get User History
```http
GET /api/programs/user/history
```

**Response (200):**
```json
{
  "enrollments": [
    {
      "enrollmentId": "uuid-1",
      "programId": "rec_2",
      "status": "completed",
      "progress": 100,
      "currentStep": 5,
      "startedAt": "2026-01-15T10:00:00Z",
      "completedAt": "2026-01-15T11:30:00Z",
      "lastAccessedAt": "2026-01-15T11:30:00Z"
    },
    {
      "enrollmentId": "uuid-2",
      "programId": "rec_2",
      "status": "in_progress",
      "progress": 50,
      "currentStep": 2,
      "startedAt": "2026-02-05T09:00:00Z",
      "completedAt": null,
      "lastAccessedAt": "2026-02-05T09:30:00Z"
    }
  ]
}
```

## Database Schema Details

### program_enrollments

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| program_id | VARCHAR(50) | Program identifier (e.g., "rec_2") |
| progress | INT | Progress percentage (0-100) |
| current_step | INT | Current step index (0-5 for 6 steps) |
| current_lesson | TEXT | Human-readable current step name |
| status | VARCHAR(20) | in_progress, completed, abandoned |
| started_at | TIMESTAMPTZ | When enrollment started |
| last_accessed_at | TIMESTAMPTZ | Last activity timestamp |
| completed_at | TIMESTAMPTZ | When completed (null if not) |
| duration | VARCHAR(20) | Estimated duration (e.g., "25 min") |
| device_info | JSONB | Optional device metadata |

**Constraints:**
- Only one active enrollment per user per program (partial unique index)
- Progress must be 0-100
- Status must be one of: in_progress, completed, abandoned

### program_step_answers

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| enrollment_id | UUID | Foreign key to program_enrollments |
| step_number | INT | Step number (1-6) |
| answers | JSONB | Flexible answer storage |
| created_at | TIMESTAMPTZ | First save |
| updated_at | TIMESTAMPTZ | Last update |

**Constraints:**
- One answer set per step per enrollment
- Step number must be 1-6
- Cascade delete with enrollment

**Example answers JSONB:**
```json
// Step 1
{ "step1": "sempre falta no fim do mês" }

// Step 3
{
  "step3_fear": "medo de nunca ter o suficiente",
  "step3_belief": "dinheiro é difícil de conseguir"
}

// Step 5
{
  "step5_actions": ["review_spending", "set_budget"],
  "step5_commitment": "vou revisar meus gastos toda segunda"
}
```

### program_ai_feedback (Future Use)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| enrollment_id | UUID | Foreign key to program_enrollments |
| step_number | INT | Step that received feedback |
| user_input | TEXT | User's original input |
| ai_feedback | TEXT | AI-generated feedback |
| feedback_rating | INT | User rating (-1, 0, 1) |
| created_at | TIMESTAMPTZ | When feedback was generated |

## Security

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own enrollments
- Users can only read/write answers for their own enrollments
- Users can only read/write feedback for their own enrollments

### Authentication

All endpoints require:
- Valid JWT token in `Authorization: Bearer <token>` header
- Token validation via Supabase `auth.getUser()`
- User ID extracted and injected into `req.user.id`

### Ownership Verification

All controller methods verify:
1. User is authenticated (`req.user?.id`)
2. Enrollment exists
3. Enrollment belongs to requesting user (`enrollment.user_id === userId`)

## Integration with Frontend

### ProgramContext Changes Needed

```typescript
// Add to OngoingProgram interface
export interface OngoingProgram {
  id: string;
  enrollmentId?: string;  // NEW: Backend enrollment ID
  title: string;
  description: string;
  currentLesson: string;
  progress: number;
  duration: string;
  startedAt: string;
  lastAccessedAt: string;
}

// Modify startProgram to sync with backend
const startProgram = async (program: OngoingProgram) => {
  // Optimistic update to localStorage
  setOngoingProgram(program);
  localStorage.setItem('eco.ongoingProgram', JSON.stringify(program));

  // Sync with backend if authenticated
  if (user) {
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/programs/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          programId: program.id,
          title: program.title,
          description: program.description,
          duration: program.duration
        })
      });

      const data = await response.json();

      // Update with enrollmentId from backend
      const syncedProgram = {
        ...program,
        enrollmentId: data.enrollmentId
      };
      setOngoingProgram(syncedProgram);
      localStorage.setItem('eco.ongoingProgram', JSON.stringify(syncedProgram));
    } catch (error) {
      console.error('Erro ao sincronizar com backend:', error);
      // Continue with localStorage-only mode
    }
  }
};
```

### Auto-Save Implementation

```typescript
// In RiquezaMentalProgram.tsx

const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

// Debounced auto-save
useEffect(() => {
  if (!ongoingProgram?.enrollmentId || !user) return;

  const timer = setTimeout(async () => {
    if (Object.keys(answers).length > 0) {
      setSaveStatus('saving');
      try {
        const token = await getAccessToken();
        await fetch(`/api/programs/${ongoingProgram.enrollmentId}/answers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            stepNumber: currentStep + 1,
            answers: answers
          })
        });

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Erro ao salvar respostas:', error);
        setSaveStatus('idle');
      }
    }
  }, 2000);  // Save 2s after last edit

  return () => clearTimeout(timer);
}, [answers, currentStep, ongoingProgram, user]);
```

### Progress Sync

```typescript
// Update progress when advancing steps
const handleNext = async () => {
  const newProgress = Math.round(((currentStep + 1) / 6) * 100);
  const newLesson = STEP_LESSONS[currentStep + 1];

  // Update local state
  setCurrentStep(currentStep + 1);

  // Sync with backend
  if (ongoingProgram?.enrollmentId && user) {
    try {
      const token = await getAccessToken();
      await fetch(`/api/programs/${ongoingProgram.enrollmentId}/progress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          progress: newProgress,
          currentStep: currentStep + 1,
          currentLesson: newLesson
        })
      });
    } catch (error) {
      console.error('Erro ao atualizar progresso:', error);
    }
  }
};
```

### Resume on Load

```typescript
// In RiquezaMentalProgram.tsx or ProgramContext

useEffect(() => {
  if (!ongoingProgram || !user) return;

  async function fetchEnrollmentData() {
    if (!ongoingProgram.enrollmentId) return;

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/programs/${ongoingProgram.enrollmentId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const data = await response.json();

      // Restore progress and answers
      setCurrentStep(data.currentStep);
      setAnswers(data.answers);
    } catch (error) {
      console.error('Erro ao recuperar dados:', error);
      // Fall back to localStorage
    }
  }

  fetchEnrollmentData();
}, [ongoingProgram, user]);
```

## Testing

### Manual Testing Flow

1. **Start program**
   - Login to app
   - Navigate to programs
   - Click "Quem Pensa Enriquece"
   - Verify enrollment created in database

2. **Answer steps**
   - Fill out step 1
   - Wait 2 seconds
   - Check database for saved answer
   - Advance to step 2

3. **Close and reopen**
   - Close browser
   - Reopen and login
   - Navigate to program
   - Verify progress restored

4. **Multi-device**
   - Complete step 1 on desktop
   - Open app on mobile with same account
   - Verify progress synced

5. **Complete program**
   - Complete all steps
   - Verify status updated to "completed"
   - Start new enrollment works

### Database Verification Queries

```sql
-- Check enrollments
SELECT id, user_id, program_id, progress, current_step, status, started_at
FROM program_enrollments
ORDER BY started_at DESC
LIMIT 10;

-- Check answers
SELECT e.user_id, a.step_number, a.answers, a.updated_at
FROM program_step_answers a
JOIN program_enrollments e ON e.id = a.enrollment_id
WHERE e.user_id = '<user-uuid>'
ORDER BY a.step_number;

-- Check completion stats
SELECT
  program_id,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_minutes
FROM program_enrollments
GROUP BY program_id, status;
```

### API Testing with curl

```bash
# Get access token from Supabase (replace with real token)
TOKEN="your-jwt-token-here"

# Start program
curl -X POST http://localhost:3001/api/programs/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "programId": "rec_2",
    "title": "Quem Pensa Enriquece",
    "duration": "25 min"
  }'

# Save answer
curl -X POST http://localhost:3001/api/programs/{enrollmentId}/answers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "stepNumber": 1,
    "answers": {
      "step1": "teste de resposta"
    }
  }'

# Get enrollment
curl http://localhost:3001/api/programs/{enrollmentId} \
  -H "Authorization: Bearer $TOKEN"
```

## Deployment Checklist

### Backend

- [ ] Run database migration
- [ ] Verify RLS policies active
- [ ] Test all endpoints with Postman/curl
- [ ] Check logs for errors
- [ ] Monitor database performance

### Frontend

- [ ] Update ProgramContext with sync logic
- [ ] Implement auto-save in RiquezaMentalProgram
- [ ] Add progress sync on step advance
- [ ] Add resume logic on program load
- [ ] Add visual indicators (saving/saved)
- [ ] Test offline fallback to localStorage

### Testing

- [ ] Test complete flow end-to-end
- [ ] Test multi-device sync
- [ ] Test offline mode
- [ ] Test abandoned program restart
- [ ] Test concurrent edits (if applicable)

## Future Enhancements

### Phase 3.5: AI Feedback (Future)
- Implement `POST /api/programs/riqueza-mental/feedback` endpoint
- Integrate OpenRouter for feedback generation
- Add feedback modal in frontend
- Track feedback quality ratings

### Phase 4: Analytics
- Dashboard for completion rates
- Average time per step analytics
- Abandonment pattern analysis
- A/B testing infrastructure

### Phase 5: Advanced Features
- Export to PDF
- Share progress with coaches
- Reminders/notifications
- Progress badges/achievements

## Files Created

### Backend
- `supabase/migrations/001_create_program_tables.sql` - Database schema
- `supabase/migrations/README.md` - Migration guide
- `server/services/ProgramService.ts` - Business logic layer
- `server/controllers/programsController.ts` - HTTP handlers
- `server/routes/programRoutes.ts` - Route definitions
- Modified: `server/core/http/app.ts` - Registered routes

### Documentation
- `PROGRAM_PERSISTENCE_IMPLEMENTATION.md` - This file

## Support

For issues or questions:
1. Check logs: `console.log` in browser, server logs in backend
2. Verify JWT token is valid
3. Check Supabase RLS policies
4. Review database constraints

## Summary

This implementation provides:
- ✅ Robust backend persistence
- ✅ Multi-device synchronization
- ✅ Auto-save functionality
- ✅ Progress tracking
- ✅ Ownership verification
- ✅ Scalable architecture
- ✅ Type-safe TypeScript
- ✅ RESTful API design
- ✅ Security via RLS

**Status:** Backend implementation complete. Frontend integration pending.

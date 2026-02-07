# Quick Start: Program Persistence System

This guide will help you get the program persistence system up and running in 5 minutes.

## Step 1: Apply Database Migration

### Option A: Using Supabase Dashboard (Easiest)

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `supabase/migrations/001_create_program_tables.sql`
5. Paste into the SQL editor
6. Click **Run**

✅ You should see "Success. No rows returned" (this is expected)

### Option B: Using Supabase CLI

```bash
cd server
supabase db push
```

## Step 2: Verify Migration

Run this query in Supabase SQL Editor:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'program_%'
ORDER BY table_name;
```

You should see:
- `program_ai_feedback`
- `program_enrollments`
- `program_step_answers`

## Step 3: Test the API

### Get a JWT Token

1. Login to your frontend app
2. Open browser DevTools → Console
3. Run:
```javascript
// Get the Supabase session token
const { data: { session } } = await supabase.auth.getSession();
console.log(session.access_token);
```
4. Copy the token

### Test the Start Endpoint

Replace `YOUR_TOKEN_HERE` with your JWT token:

```bash
curl -X POST http://localhost:3001/api/programs/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "programId": "rec_2",
    "title": "Quem Pensa Enriquece",
    "duration": "25 min"
  }'
```

Expected response:
```json
{
  "enrollmentId": "some-uuid-here",
  "programId": "rec_2",
  "progress": 0,
  "currentStep": 0,
  "currentLesson": "Passo 1: Onde você está",
  "startedAt": "2026-02-05T...",
  "status": "in_progress"
}
```

### Test Save Answers

Replace `ENROLLMENT_ID` and `YOUR_TOKEN_HERE`:

```bash
curl -X POST http://localhost:3001/api/programs/ENROLLMENT_ID/answers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "stepNumber": 1,
    "answers": {
      "step1": "Minha relação com dinheiro é complicada"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "saved": true,
  "updatedAt": "2026-02-05T..."
}
```

## Step 4: Verify in Database

Run in Supabase SQL Editor:

```sql
-- See your enrollment
SELECT id, program_id, progress, current_step, status, started_at
FROM program_enrollments
ORDER BY started_at DESC
LIMIT 5;

-- See your answers
SELECT step_number, answers, updated_at
FROM program_step_answers
WHERE enrollment_id = 'YOUR_ENROLLMENT_ID';
```

## Step 5: Deploy Backend

### If using Render/Railway/etc

1. Commit your changes:
```bash
git add .
git commit -m "feat: add program persistence system"
git push
```

2. Your backend should auto-deploy

3. Verify the migration ran:
   - Check deployment logs for any SQL errors
   - Test the API endpoints in production

### If using Vercel

The backend routes will automatically be available at:
```
https://your-app.vercel.app/api/programs/start
```

## Troubleshooting

### Error: "Table already exists"

This means you already ran the migration. To start fresh:

```sql
-- Drop tables (WARNING: deletes all data)
DROP TABLE IF EXISTS program_ai_feedback CASCADE;
DROP TABLE IF EXISTS program_step_answers CASCADE;
DROP TABLE IF EXISTS program_enrollments CASCADE;
```

Then re-run the migration.

### Error: "Unauthorized" or "Token inválido"

- Make sure your JWT token is valid and not expired
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in backend `.env`
- Verify the token is prefixed with `Bearer ` in the header

### Error: "NOT_FOUND" when getting enrollment

- Make sure the enrollmentId exists
- Verify you're using the correct user's token
- Check RLS policies are active:

```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'program_%';
```

### No data returned

- Check that RLS is enabled:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'program_%';
```

All should show `rowsecurity = true`

## Next Steps

Now that the backend is working, integrate it with the frontend:

1. Update `ProgramContext.tsx` to sync with backend
2. Add auto-save to `RiquezaMentalProgram.tsx`
3. Implement progress sync on step navigation
4. Add resume logic to load saved progress

See `PROGRAM_PERSISTENCE_IMPLEMENTATION.md` for detailed frontend integration code.

## Health Check

Once deployed, verify everything is working:

```bash
# Check backend is up
curl https://your-backend.com/health

# Check program routes are registered
curl https://your-backend.com/api/programs/user/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: Either an empty array `{"enrollments":[]}` or your enrollments list.

## Success Criteria

✅ Migration applied without errors
✅ Tables visible in Supabase dashboard
✅ RLS policies active
✅ `/api/programs/start` returns enrollmentId
✅ Answers can be saved and retrieved
✅ Backend deployed successfully

---

**Estimated Time:** 5-10 minutes
**Difficulty:** Easy (copy-paste SQL and test)

For detailed API documentation, see `PROGRAM_PERSISTENCE_IMPLEMENTATION.md`.

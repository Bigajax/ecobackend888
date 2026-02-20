# Analytics Security Hardening - Quick Reference Card

## 🚀 One-Command Implementation

```bash
# 1. Apply migration (Supabase Dashboard SQL Editor)
# Copy & run: 20260211_harden_analytics_security.sql

# 2. Verify (run in SQL Editor)
# Copy & run: 20260211_verify_analytics_security.sql

# 3. Test backend
node supabase/migrations/test_analytics_backend.js
```

---

## 📋 Pre-Flight Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in `.env`
- [ ] Backend running (`npm run dev`)
- [ ] Recent database backup exists (Supabase automatic)
- [ ] Read implementation guide: `README_SECURITY_HARDENING.md`

---

## ✅ Expected Results

### After Migration
```sql
-- All tables should show RLS enabled
SELECT COUNT(*) FROM pg_tables
WHERE schemaname = 'analytics' AND rowsecurity = true;
-- Expected: 11

-- Deny policies should exist
SELECT COUNT(*) FROM pg_policies
WHERE schemaname = 'analytics' AND policyname LIKE 'deny_%';
-- Expected: 22

-- No grants for anon/authenticated
SELECT COUNT(*) FROM information_schema.table_privileges
WHERE table_schema = 'analytics' AND grantee IN ('anon', 'authenticated');
-- Expected: 0
```

### Backend Test Output
```
Testing: POST /api/ask-eco (Analytics INSERT)... ✅ PASS
Testing: POST /api/signal (Passive Signals INSERT)... ✅ PASS
Results: 2 passed, 0 failed
✅ All tests passed! Backend can write to analytics tables.
```

### Client Lockdown Test (Should FAIL - Expected!)
```bash
curl -X GET "https://xxx.supabase.co/rest/v1/eco_interactions?select=*" \
  -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY"

# Expected: {"code":"42501","message":"permission denied"}
```

---

## 🔧 Quick Commands

### Verify RLS Status
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'analytics';
```

### Check Deny Policies
```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'analytics' AND policyname LIKE 'deny_%'
ORDER BY tablename;
```

### Verify service_role Access
```sql
SELECT DISTINCT table_name FROM information_schema.table_privileges
WHERE table_schema = 'analytics' AND grantee = 'service_role';
-- Expected: All 11 tables listed
```

### Check Backend Client Configuration
```bash
grep -A5 "getAnalyticsClient" server/services/supabaseClient.ts
# Should show: createClient(supabaseUrl, serviceRoleKey, ...)
```

---

## 🚨 Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend permission denied | Missing service_role key | Set `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| Migration fails "already exists" | Policy exists from previous run | Safe to ignore (idempotent) |
| anon still has grants | Manual grants added after migration | Run: `REVOKE ALL ON analytics.* FROM anon;` |
| Backend test times out | Backend not running | Start with `npm run dev` |

---

## 🔄 Emergency Rollback

```bash
# Run this ONLY if backend breaks (should NOT be needed)
# Copy 20260211_rollback_analytics_security.sql into SQL Editor and run

# After rollback, investigate root cause before re-applying
```

---

## 📊 Security Summary

| Before | After |
|--------|-------|
| ❌ RLS disabled | ✅ RLS enabled |
| ❌ Anon can query via API | ✅ Anon blocked by RLS |
| ❌ session_id exposed | ✅ All columns protected |
| ❌ No explicit policies | ✅ Explicit deny-all policies |
| ❌ View access unrestricted | ✅ Views locked to service_role |

---

## 📞 Files Reference

| File | Purpose |
|------|---------|
| `20260211_harden_analytics_security.sql` | **Main migration** (apply this) |
| `20260211_verify_analytics_security.sql` | **Verification queries** (run after) |
| `20260211_rollback_analytics_security.sql` | Emergency rollback (use if broken) |
| `test_analytics_backend.js` | Backend integration test (run after) |
| `README_SECURITY_HARDENING.md` | Full implementation guide (read this) |
| `IMPLEMENTATION_SUMMARY.md` | Executive summary (overview) |
| `QUICK_REFERENCE.md` | This file (quick commands) |

---

## ⏱️ Implementation Timeline

1. **Apply Migration**: 2 minutes (copy/paste SQL)
2. **Verify**: 3 minutes (run verification queries)
3. **Test Backend**: 5 minutes (integration test)
4. **Test Lockdown**: 2 minutes (curl test)
5. **Monitor**: 24 hours (check logs)

**Total Active Time**: ~15 minutes
**Total Elapsed**: ~24 hours (monitoring period)

---

## ✅ Success Indicator

**You're done when**:
- ✅ Verification queries show expected results
- ✅ Backend integration test passes
- ✅ Client lockdown test fails (403/401)
- ✅ No permission errors in backend logs
- ✅ Analytics data continues collecting

---

**Risk**: Low | **Rollback**: Available | **Breaking Changes**: None

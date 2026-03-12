# Runbook

## 1) MCP Opens But Tool Calls Fail

### Symptom

- ChatGPT can list actions or open the app
- `tools/call` fails with `404 Not Found [endpoint=...]`

### Root Cause

- `SUPABASE_MCP_ENDPOINT` points to the wrong function route

### Fix

1. probe the direct function endpoint with `SUPABASE_ANON_KEY`
2. set `SUPABASE_MCP_ENDPOINT` to the tested route
3. redeploy Vercel
4. rerun smoke checks

## 2) Function Path Mismatch

### Symptom

- one Supabase function path works
- another path for the same function returns `404`

### Root Cause

- deployed function routing and configured endpoint drifted

### Fix

1. deploy `server` function from current source
2. verify `/functions/v1/server/mcp`
3. repoint Vercel to the exact working endpoint

## 3) Migration History Drift

### Symptom

- `supabase db push` or `supabase db pull` refuses to run

### Root Cause

- local and remote migration history diverged

### Fix

1. move local-only migration files out of `supabase/migrations`
2. run `supabase migration fetch --project-ref jpjxpyhuawgyrhbnnqyb`
3. diff remote and local SQL
4. create a reconcile migration if needed

## 4) Runtime Query Failures

### Symptom

- errors such as `Cannot coerce the result to a single JSON object`

### Root Cause

- duplicate rows or schema assumptions in runtime queries

### Fix

1. make reads tolerant where safe
2. add cleanup or uniqueness migration if duplicates are real data, not a code bug
3. retest direct function and Vercel MCP paths

## Healthy State Checklist

1. direct Supabase function probe returns `200`
2. `/mcp initialize` returns `200`
3. `/mcp tools/call sync_state` succeeds
4. `/mcp tools/call get_progress` succeeds
5. ChatGPT app opens and widget updates

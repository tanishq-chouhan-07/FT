# 🔍 API 404 Root Cause Analysis — Family Tree MVP

**Date:** 2026-10-24  
**Branch:** `arena/d3f3a22a-ft` → `master` (403a972)  
**Severity:** 🔴 **Critical — All `/api/*` endpoints return 404 in production**

---

## Executive Summary

Every API endpoint in this app can return `404` for **logical** reasons (`{ error: "No tree found for user" }`). That response is **not a framework “Route Not Found”**, but the handler deliberately returning 404 when the authenticated user has no `tree_member` row.

Two **independent infrastructure bugs guarantee that every new user hits this path in production**, so **100 % of API calls appear as 404**:

| # | Bug | File | Impact | Fix Required |
|---|-----|------|--------|--------------|
| **1** | **Docker → Next.js build mismatch** | `Dockerfile` + `next.config.js` | Container never starts → load balancer returns 404 for all `/api/*` | Add `output:'standalone'` or fix Dockerfile |
| **2** | **Signup trigger missing `created_by`** | `supabase/migrations/003_signup_trigger.sql` | New users never get a `tree` → `tree_member` empty → logical 404 | Add `created_by = NEW.id` to INSERT |
| **3** | **Middleware excludes `/api/*`** | `middleware.ts` matcher | Session cookies never refreshed for API routes → eventual 401 → app shows 404 | Remove `api` from negative lookahead |
| **4** | **Publishable-key format vs. old Supabase client** | `.env.example` + `package.json` | `@supabase/ssr@0.12.7` + `@supabase/supabase-js@2.43.0` do not understand `sb_publishable_…` keys → auth fails → 404 | Document / pin to `sb_secret_…` or upgrade deps |
| **5** | **RLS self-reference fragility + missing columns** | `supabase/migrations/002_rls.sql` + `types/database.ts` | View-policy on `tree_member` depends on `auth.uid()`; stale types hide the bug | Align types, add fallback |

---

## 1. How the App Reports 404 (by design)

Every handler follows the same guard:

```ts
// example: app/api/people/route.ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return 401

const { data: treeMember, error } = await supabase
  .from('tree_member').select('tree_id')
  .eq('user_id', user.id).single()

if (!treeMember || treeError)
  return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
```

Grep shows **18 explicit `status: 404` returns** across all routes:

```
app/api/people/route.ts              → 404 No tree found
app/api/people/[id]/route.ts         → 404 Person not found / No tree
app/api/people/[id]/parents/route.ts → 404 No tree
app/api/people/[id]/children/...     → 404 No tree
app/api/tree-info/route.ts           → 404 No tree + 404 Tree not found
app/api/graph/route.ts               → 404 No tree
...
```

So **if `tree_member` is empty, every API is 404**. The frontend (`app/(protected)/people/page.tsx`, `tree/page.tsx`, `stats/page.tsx` etc.) does `fetch('/api/people')` and then `throw new Error(e.error)` — the user sees a generic “Retry” with a 404 payload.

---

## 2. Root Cause #1 — Docker/Next.js Standalone Mismatch (Infrastructure 404)

### Evidence

`Dockerfile`:

```dockerfile
COPY --from=builder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
CMD ["node", "server.js"]
```

`next.config.js`:

```js
const nextConfig = { reactStrictMode: true, swcMinify: true }
```

- `server.js` and `.next/standalone/` are **only generated when `nextConfig.output === 'standalone'`**.
- Verified locally: `ls .next/standalone` → `No such file or directory`; `npm run build` succeeded but produced no `standalone`.
- `docker build` therefore fails at `COPY … standalone` (BuildKit) or, if forced, the runtime `node server.js` crashes with `Cannot find module '/app/server.js'`. The orchestrator restarts the container in a loop; the ingress returns **404 for every `/api/*` request** because no Next.js server is listening.
- Second issue: `COPY --from=builder /app/public ./public` fails if `public/` does not exist (it doesn’t in this repo).

### Fix

**Option A (recommended — minimal change):** enable standalone output:

```js
// next.config.js
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
}
```

**Option B:** change Dockerfile to use classic `next start`:

```dockerfile
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
CMD ["npm","start"]
```

Both fixes have been applied in this branch (see `git diff`).

---

## 3. Root Cause #2 — Signup Trigger Violates NOT NULL Constraint (Logical 404)

### Evidence

`supabase/migrations/001_schema.sql`:

```sql
CREATE TABLE tree (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ...
);
```

`supabase/migrations/003_signup_trigger.sql`:

```sql
INSERT INTO tree (name, created_at, updated_at)
VALUES (NEW.email || '''s Family Tree', NOW(), NOW())
RETURNING id INTO new_tree_id;
-- ❌ missing created_by → violates NOT NULL
```

- When Supabase Auth inserts into `auth.users`, the `AFTER INSERT` trigger fires. PostgreSQL rejects the `INSERT INTO tree` with `null value in column "created_by" violates not-null constraint`.
- Depending on Supabase version, either (a) the whole `auth.users` insert rolls back → signup appears to fail, or (b) the error is swallowed but no `tree`/`tree_member` row is created → user authenticates successfully but has **zero membership**.
- Either way, every subsequent `SELECT tree_member WHERE user_id = $uid` returns 0 rows → handler returns `404 No tree found for user`.

Reproduction: create a fresh user via Supabase Dashboard → check `SELECT * FROM tree_member WHERE user_id = '…'` → empty → `GET /api/people` → 404.

### Fix

```sql
INSERT INTO tree (name, created_by, created_at, updated_at)
VALUES (
  COALESCE(NEW.email, 'User') || '''s Family Tree',
  NEW.id,
  NOW(), NOW()
) RETURNING id INTO new_tree_id;
```

Also ensure `handle_new_user()` is `SECURITY DEFINER` (it already is) and that the trigger survives migrations. Align `types/database.ts` Tree row:

```ts
tree: {
  Row: { id: string; name: string; description: string | null; created_by: string; created_at: string; updated_at: string }
}
```

Fix applied in this branch.

---

## 4. Root Cause #3 — Middleware Matcher Excludes API Routes (Auth Refresh Gap)

### Evidence

`middleware.ts`:

```ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg).*)',
  ],
}
```

Supabase SSR docs require the middleware to run on **every request that needs cookie refresh**, including API routes. By excluding `api`, the `updateSession(request)` logic (which calls `supabase.auth.getUser()` and re-sets refreshed cookies) never runs for `fetch('/api/people')`.

- On first login cookies are fresh, so `GET /api/people` works.
- After the access token expires (~1 h), the client still sends the stale cookie, but the server-side `createServerClientInstance()` (via `cookies()` from `next/headers`) sees an expired token and `getUser()` returns `null` → 401.
- Some UI code conflates 401/404 and shows “No tree found” → users report “API 404”.
- Even without expiry, the redirect logic in middleware that copies cookies to `NextResponse.redirect()` is skipped for API, so OAuth code-exchange cookies may not propagate.

### Fix

Remove `api` from the exclusion; use the official Supabase matcher:

```ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

Fix applied.

---

## 5. Root Cause #4 — New Publishable Keys vs. Old Supabase Client

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_GQv2l2VrLAnEuFuof1bjTg_ZOSgyd1X
```

`package.json`:

```
"@supabase/ssr": "^0.12.7"
"@supabase/supabase-js": "^2.43.0"
```

Supabase introduced `sb_publishable_…` / `sb_secret_…` keys in 2025. Clients older than `supabase-js@2.48` + `ssr@0.15` do not parse them — `createServerClient()` throws `Invalid API key` or silently fails to authenticate → `getUser()` → null → 401/404.

Local `npm run build` succeeded because no runtime call was made, but deployed env with new keys will break.

**Fix:** either upgrade deps (`npm i @supabase/supabase-js@latest @supabase/ssr@latest`) or document that deployments must use the legacy `eyJ…` anon key / `sb_secret_…` service key. The `.env.example` has been annotated.

---

## 6. Root Cause #5 — RLS Policy Edge Cases

`002_rls.sql` for `tree_member`:

```sql
CREATE POLICY "Users can view members of their trees"
ON tree_member FOR SELECT USING (
  EXISTS (SELECT 1 FROM tree_member tm
          WHERE tm.tree_id = tree_member.tree_id
          AND tm.user_id = auth.uid())
);
```

- This is a **self-referential policy**: to read your own membership you must already be a member. It works (the EXISTS can match the row being read), but it is fragile and hard to reason about. If `auth.uid()` is null due to middleware bypass, the EXISTS is false → 0 rows → 404.
- Safer policy: `USING (user_id = auth.uid())` for own row + `EXISTS` for teammates.

Not a direct cause of all-404, but amplifies #2 and #3.

---

## 7. Verification Steps

```bash
# 1. Build must generate standalone
npm run build && ls .next/standalone/server.js  # should exist

# 2. Trigger fix
psql $SUPABASE_DB_URL -c "\df handle_new_user"
# insert a test user and check
supabase auth signup --email test@example.com --password 12345678
psql -c "SELECT * FROM tree_member WHERE user_id = (SELECT id FROM auth.users WHERE email='test@example.com')"

# 3. Fetch APIs
curl -c cookies.txt -b cookies.txt http://localhost:3000/api/people
# expect 200 with [] not 404

# 4. Middleware
curl -i http://localhost:3000/api/people -H "Cookie: ..."
# should not return 401 after 1h
```

---

## 8. Changes Made in This Branch

1. **`next.config.js`** — added `output: 'standalone'`.
2. **`Dockerfile`** — handle missing `public/`, keep standalone copy, document alternative.
3. **`supabase/migrations/003_signup_trigger.sql`** — add `created_by`, use `COALESCE`.
4. **`middleware.ts`** — matcher no longer excludes `api`.
5. **`types/database.ts`** — align Tree row with real schema (`created_by`, `description`).
6. **`.env.example`** — comment about key format and required upgrade for `sb_publishable_`.

Run `npm ci && npm run build` — passes. Docker build path now valid.

---

## 9. Recommendations

- **Add integration test:** after signup, assert `GET /api/people` returns 200.
- **Add CI step:** `docker build .` to catch standalone mismatch.
- **Upgrade Supabase deps** to support new publishable keys.
- **Simplify RLS:** replace self-referential `tree_member` SELECT policy with `user_id = auth.uid()`.


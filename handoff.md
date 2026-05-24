# heptimer Handoff

## Project

- Path: `D:\01.Coding\heptimer`
- Stack: Next.js App Router, TypeScript, Tailwind CSS v4, Supabase, pnpm
- Dev URL: `http://localhost:3001`
- Package manager: `pnpm`

## Current Status

The project is a working personal focus timer MVP.

Implemented:

- Next.js app scaffolded under `D:\01.Coding\heptimer`
- Wanted-inspired dashboard UI
- Burgundy red accent color
- 25 / 30 / 50 minute timer presets
- Start / Pause / Record flow
- Category selection and category creation
- Supabase email + password auth
- Supabase category persistence
- Supabase focus session persistence
- Login state survives refresh
- Day / Weekly / Monthly statistics modes
- Heatmap-style focus visualization
- Summary bar chart for recent periods
- Local preview fallback when Supabase env vars are missing

## Important Files

- `src/components/focus-timer-app.tsx`
  - Main app UI and client-side behavior
  - Auth, category loading, session loading, timer state, stats aggregation

- `src/lib/supabase/client.ts`
  - Supabase browser client factory
  - Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- `supabase/schema.sql`
  - Idempotent DB schema
  - Creates `profiles`, `focus_categories`, `focus_sessions`
  - Enables RLS
  - Recreates required policies safely

- `.env.example`
  - Supabase env variable template

- `README.md`
  - Setup notes and Supabase auth guidance

- `public/icons/`
  - Icons copied from `D:\01.Coding\01-1_Design`

## Supabase Setup Done

The schema has been run successfully in Supabase. The SQL editor returned:

```text
Success. No rows returned
```

The app was connected with `.env.local`, and email/password auth is working.

Required local env:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Supabase auth settings used:

- Authentication > Providers > Email enabled
- Email + password login is used
- Magic link was removed because of email rate limits
- For smooth development, Confirm email should be disabled unless email confirmation is desired

## Commands

Run dev server:

```bash
pnpm dev --port 3001
```

Checks:

```bash
pnpm lint
pnpm build
```

Both passed after the latest code changes.

## Current Behavior Notes

- `Record` saves a session if at least 60 seconds elapsed.
- Recorded sessions are inserted optimistically into UI first.
- If logged in, a session is also inserted into `focus_sessions`.
- Current DB status mapping:
  - Timer reaching zero saves `status = completed`
  - Manual `Record` currently saves `status = canceled`
- Categories created while logged in are inserted into `focus_categories`.
- If a new user has no categories, the app seeds:
  - `공부`
  - `코딩`
  - `독서`

## Known Issues / Technical Debt

- Manual `Record` behavior is semantically unclear.
  - It currently means "record elapsed time so far."
  - DB status becomes `canceled`, which may not be the desired long-term meaning.

- There is no session history list yet.
  - Users cannot see or delete individual sessions.
  - Mistaken records cannot be corrected from UI.

- Category management is minimal.
  - Add only.
  - No rename/delete.
  - Category color exists in DB but is not used in UI.

- Statistics are client-side aggregations.
  - Fine for MVP.
  - Later can move to Supabase SQL view/RPC if data volume grows.

- Heatmap is visually inspired by the provided reference, but not yet interactive.
  - No click-to-inspect date.
  - Tooltip is browser default only.

- There is no Vercel deployment yet.

## Recommended Next Steps

1. Session history list
   - Show latest 10-20 sessions.
   - Columns: date/time, category, planned minutes, actual minutes, status.
   - Add delete action.
   - Delete should remove from Supabase and local state.

2. Clarify timer completion flow
   - Replace `Record` with clearer actions:
     - `Complete`
     - `Cancel`
   - Save `completed` only for finished sessions.
   - Save `canceled` only for explicitly canceled sessions.

3. Category management
   - Rename category.
   - Delete category.
   - Consider preserving sessions with `category_id = null` on delete, matching current schema.

4. Better stats interaction
   - Click heatmap cell to show that date's sessions.
   - Add category filter.
   - Add total focus time and session count per selected mode.

5. Deploy
   - Create GitHub repo.
   - Push project.
   - Connect Vercel.
   - Add Supabase env vars in Vercel.
   - Add Vercel domain to Supabase Auth redirect URLs.

## Design Direction

Current UI follows:

- `D:\01.Coding\_harness\DESIGN-by-Wanted.md`
- `D:\01.Coding\_harness\SKILL-by-wanted.md`

Visual rules currently applied:

- White elevated card surface
- Light gray app background
- 14px radius
- Thin gray borders
- Subtle shadow
- Burgundy red accent `#8f1d2c`
- Mostly grayscale heatmap with red only for highest intensity

Original Hepta design guidance was intentionally overridden by user request to follow Wanted design.

## Git Status

The repository was initialized, but no commit has been made yet.

Most files are still untracked because this is a new scaffold. Before committing, review:

```bash
git status --short
```

Do not commit `.env.local`.


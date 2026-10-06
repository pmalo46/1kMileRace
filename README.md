# 1K Miles

A year-long social race: run or walk 1,000 cumulative miles in 365 days, and help as many people as possible cross the finish line.

Two winners per race:
1. **First to 1,000**: decided by when the miles were run, not when they were uploaded.
2. **Fastest 1,000**: least total moving time across a finisher's first 1,000 counted miles.

See [docs/PLAN.md](docs/PLAN.md) for the full product and engineering plan.

## Repo layout

| Path | What |
|---|---|
| `apps/mobile` | Expo (React Native) app for iOS and Android |
| `packages/core` | Shared TypeScript: race rules engine, dedup, pace/projection math, leaderboard ordering |
| `supabase/migrations` | Postgres schema, row-level security, standings triggers |
| `supabase/tests` | Database tests that run the migrations in-process with PGlite (no Docker needed) |

Units: distances are stored in meters (what every device and API reports) and shown in miles.

## Getting started

```bash
npm install
npm test          # core + database tests
npm run typecheck
```

### Backend (Supabase)

1. Create a project at supabase.com.
2. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Push auth settings: `npx supabase config push`. Email confirmation is off, so the app's email and password sign-in never sends email.
4. Deploy the edge function: `npx supabase functions deploy ingest-activity`.
5. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the URL and publishable key.

### Mobile app

```bash
cd apps/mobile
npx expo start
```

Expo Go works for most screens, and records runs only while the app is open with the screen on. For recording with the screen locked (and, later, Apple Health / Health Connect), use a development build:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init                # first time only: links the app to your Expo account
npx eas-cli@latest build --profile development --platform android
```

Install the APK it produces on your phone, then `npx expo start` and open the 1K Miles app (press `s` in the terminal to switch between the development build and Expo Go).

## Status

Phase 0 (foundations) is in place:
- rules engine with tests
- schema with standings, milestones, feed, review and RLS, with tests
- app shell: email and password sign-in, home with progress ring and pace-to-finish, live leaderboards (distance and time), create race, join race

Phase 1 so far:
- record runs and walks with GPS (the main way to log): auto-pause, route sketch, background tracking in development builds, stored on the phone until uploaded; the server re-measures the route and rejects mock-location runs
- add a run by hand as a fallback (outdoors, or treadmill with a console photo); marked for review
- the `ingest-activity` edge function applies the shared rules engine and dedup before saving
- a live race feed of runs, milestones, finishes and new members, with emoji cheers and comments

Next up: push notifications (cheers, comments, milestones), then Health Connect / Apple Health import (watch runs, including treadmill).
